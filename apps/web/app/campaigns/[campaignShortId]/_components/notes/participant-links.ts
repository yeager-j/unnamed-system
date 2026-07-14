import {
  autocompletion,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSection,
  type CompletionSource,
} from "@codemirror/autocomplete"
import type { Extension } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { startTransition } from "react"
import { toast } from "sonner"

import { wikiLinks, type WikiLinkResolvedTarget } from "@workspace/editor"

import { serializeChipToken } from "@/domain/planner/chip"
import type { ParticipantRef } from "@/domain/planner/participant"
import {
  filterLinkerOptions,
  type LinkerOption,
} from "@/domain/planner/view/linker"
import {
  campaignArticlePath,
  campaignNpcPath,
  characterPath,
} from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import {
  participantLinkCompletionMenu,
  registerParticipantCompletion,
} from "./participant-link-completion-menu"
import {
  isPositionInsideCode,
  participantLinkDecorations,
  participantTargetOf,
} from "./participant-link-decorations"

const MAX_SUGGESTIONS = 8
const WORLD_SECTION: CompletionSection = {
  name: "From the world web",
  rank: 0,
}
const CREATE_SECTION: CompletionSection = { name: "Create", rank: 1 }

type CompletionTrigger = "@" | "[["

export interface ParticipantLinkTarget {
  ref: ParticipantRef
  label: string
  tombstoned: boolean
  /** Character URLs use a short id while the durable participant ref uses an entity id. */
  characterShortId?: string
}

export interface ParticipantLinkWorldSnapshot {
  options: readonly LinkerOption[]
  targets: readonly ParticipantLinkTarget[]
}

/** Stable external store captured once by a long-lived CodeMirror instance. */
export interface ParticipantLinkWorld {
  getSnapshot: () => ParticipantLinkWorldSnapshot
  replace: (snapshot: ParticipantLinkWorldSnapshot) => void
  subscribe: (listener: () => void) => () => void
}

export interface ParticipantLinkExtensionsConfig {
  campaignId: string
  campaignShortId: string
  world: ParticipantLinkWorld
  navigate: (href: string) => void
  mint?: (
    kind: "npc" | "article",
    campaignId: string,
    name: string
  ) => Promise<ParticipantRef | null>
  debounceMs?: number
}

/**
 * Derives a world snapshot from the linker's live option rows. The options are
 * the live world web, so every derived target resolves (`tombstoned: false`); a
 * chip token whose ref has since been deleted simply isn't found and renders
 * "missing". A character row carries its URL short id through so its chip opens
 * the sheet (the `character:` ref id is the durable entity id, not the slug).
 */
export function participantWorldSnapshot(
  options: readonly LinkerOption[]
): ParticipantLinkWorldSnapshot {
  return {
    options,
    targets: options.map((option) => ({
      ref: option.ref,
      label: option.label,
      tombstoned: false,
      characterShortId: option.characterShortId,
    })),
  }
}

export function createParticipantLinkWorld(
  initial: ParticipantLinkWorldSnapshot
): ParticipantLinkWorld {
  let snapshot = initial
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => snapshot,
    replace: (next) => {
      snapshot = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Builds the campaign-specific participant layer. `wikiLinks` intentionally
 * receives no `suggest`: two autocomplete extensions that both set `override`
 * throw during editor creation, so the single first-party owner below contains
 * every completion source. The creation test enforces that invariant. The
 * controlled shadcn view mirrors this owner's public state without taking
 * editor focus or creating a second completion model.
 */
export function createParticipantLinkExtensions(
  config: ParticipantLinkExtensionsConfig
): Extension[] {
  const sources: CompletionSource[] = [
    participantCompletionSource("@", config),
    participantCompletionSource("[[", config),
  ]

  return [
    wikiLinks({
      resolve: async (target) => resolveWikiLink(config.world, target),
      onOpen: (target) => openParticipantLink(config, target),
      openOnClick: true,
    }),
    participantLinkDecorations(config.world),
    autocompletion({
      activateOnTyping: true,
      icons: false,
      override: sources,
      tooltipClass: () => "cm-participant-native-completion",
    }),
    participantLinkCompletionMenu(),
  ]
}

function participantCompletionSource(
  trigger: CompletionTrigger,
  config: ParticipantLinkExtensionsConfig
): CompletionSource {
  return async (context) => {
    const match = matchParticipantTrigger(context, trigger)
    if (
      match === null ||
      isPositionInsideCode(context.state, match.triggerFrom)
    ) {
      return null
    }

    await delay(config.debounceMs ?? 120)
    if (context.aborted) return null

    const query = match.text.slice(trigger.length)
    const worldOptions = filterLinkerOptions(
      config.world.getSnapshot().options,
      query
    ).slice(0, MAX_SUGGESTIONS)
    if (context.aborted) return null

    const options = worldOptions.map((option) =>
      participantCompletion(option, trigger)
    )
    const mintName = query.trim()
    if (mintName !== "") {
      options.push(
        mintCompletion("npc", mintName, trigger, config),
        mintCompletion("article", mintName, trigger, config)
      )
    }

    return {
      from: match.triggerFrom + trigger.length,
      to: context.pos,
      options,
    }
  }
}

function matchParticipantTrigger(
  context: CompletionContext,
  trigger: CompletionTrigger
): { triggerFrom: number; text: string } | null {
  const match = context.matchBefore(
    trigger === "@" ? /@[^@\n]*$/ : /\[\[[^[\]\n|]*$/
  )
  if (match === null) return null
  if (trigger === "@" && match.from > 0) {
    const prefix = context.state.doc.sliceString(match.from - 1, match.from)
    if (!/\s/.test(prefix)) return null
  }
  return { triggerFrom: match.from, text: match.text }
}

function participantCompletion(
  option: LinkerOption,
  trigger: CompletionTrigger
): Completion {
  const completion: Completion = {
    label: option.label,
    detail: option.sublabel ?? undefined,
    section: WORLD_SECTION,
    apply: (view, selected, from, to) => {
      applyParticipantRef(view, selected, from, to, trigger, option.ref)
    },
  }
  registerParticipantCompletion(completion, {
    iconKey: option.iconKey,
    kind: "option",
  })
  return completion
}

function mintCompletion(
  kind: "npc" | "article",
  name: string,
  trigger: CompletionTrigger,
  config: ParticipantLinkExtensionsConfig
): Completion {
  const kindLabel = kind === "npc" ? "NPC" : "Article"
  const completion: Completion = {
    label: `Create “${name}” as ${kindLabel}`,
    section: CREATE_SECTION,
    boost: -1,
    apply: (view, selected, from, to) => {
      startTransition(() =>
        guardWriteTransition(
          () =>
            applyMintedParticipant(
              view,
              selected,
              from,
              to,
              trigger,
              kind,
              name,
              config
            ),
          () => toast.error(mintFailureMessage(name))
        )
      )
    },
  }
  registerParticipantCompletion(completion, { iconKey: kind, kind: "mint" })
  return completion
}

function applyParticipantRef(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  trigger: CompletionTrigger,
  ref: ParticipantRef
) {
  const range = replacementRange(view, from, to, trigger)
  const insert = `${serializeChipToken(ref)} `
  view.dispatch({
    changes: { ...range, insert },
    selection: { anchor: range.from + insert.length },
    annotations: pickedCompletion.of(completion),
  })
}

async function applyMintedParticipant(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  trigger: CompletionTrigger,
  kind: "npc" | "article",
  name: string,
  config: ParticipantLinkExtensionsConfig
) {
  const capturedDocument = view.state.doc
  view.dispatch({ annotations: pickedCompletion.of(completion) })

  const mint = config.mint ?? mintParticipantRef
  const ref = (await mint(kind, config.campaignId, name)) ?? null
  if (ref === null) {
    toast.error(mintFailureMessage(name))
    return
  }
  if (!view.dom.isConnected || view.state.doc !== capturedDocument) {
    return
  }

  addMintedParticipant(config.world, ref, name)
  applyParticipantRef(view, completion, from, to, trigger, ref)
  toast.success(`${name} created.`)
}

function mintFailureMessage(name: string): string {
  return `Couldn't create ${name}. Try again.`
}

async function mintParticipantRef(
  kind: "npc" | "article",
  campaignId: string,
  name: string
): Promise<ParticipantRef | null> {
  const minting = await import("../world/mint-participant-ref")
  return minting.mintParticipantRef(kind, campaignId, name)
}

function replacementRange(
  view: EditorView,
  from: number,
  to: number,
  trigger: CompletionTrigger
) {
  const replaceTo =
    trigger === "[[" && view.state.doc.sliceString(to, to + 2) === "]]"
      ? to + 2
      : to
  return { from: from - trigger.length, to: replaceTo }
}

function addMintedParticipant(
  world: ParticipantLinkWorld,
  ref: ParticipantRef,
  fallbackLabel: string
) {
  const snapshot = world.getSnapshot()
  const key = participantTargetOf(ref)
  const label = ref.label?.trim() || fallbackLabel
  world.replace({
    options: [
      ...snapshot.options.filter(
        (option) => participantTargetOf(option.ref) !== key
      ),
      {
        ref: { ...ref, label },
        label,
        sublabel: null,
        iconKey: ref.kind,
      },
    ],
    targets: [
      ...snapshot.targets.filter(
        (target) => participantTargetOf(target.ref) !== key
      ),
      { ref: { ...ref, label }, label, tombstoned: false },
    ],
  })
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function resolveWikiLink(
  world: ParticipantLinkWorld,
  target: string
): WikiLinkResolvedTarget | null {
  const resolved = world
    .getSnapshot()
    .targets.find((candidate) => participantTargetOf(candidate.ref) === target)
  if (resolved === undefined) return null
  return {
    target,
    label: resolved.label,
    status: resolved.tombstoned ? "unresolved" : "resolved",
  }
}

function openParticipantLink(
  config: ParticipantLinkExtensionsConfig,
  target: string
) {
  const resolved = config.world
    .getSnapshot()
    .targets.find((candidate) => participantTargetOf(candidate.ref) === target)
  if (resolved === undefined || resolved.tombstoned) return

  const href = participantHref(config.campaignShortId, resolved)
  if (href !== null) config.navigate(href)
}

function participantHref(
  campaignShortId: string,
  target: ParticipantLinkTarget
): string | null {
  switch (target.ref.kind) {
    case "article":
      return campaignArticlePath(campaignShortId, target.ref.id)
    case "npc":
      return campaignNpcPath(campaignShortId, target.ref.id)
    case "character":
      return target.characterShortId
        ? characterPath(target.characterShortId)
        : null
  }
}
