"use client"

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import {
  createParticipantLinkExtensions,
  createParticipantLinkWorld,
  type ParticipantLinkWorldSnapshot,
} from "@/app/campaigns/[campaignShortId]/_components/notes/participant-links"
import { Prose } from "@/components/shared/prose"
import type { ParticipantRef } from "@/domain/planner/participant"
import {
  previewSummary,
  type ParticipantPreview,
} from "@/domain/planner/participant-preview"

import "@workspace/editor/styles.css"

const AtomicCodeMirrorEditor = dynamic(
  () =>
    import("@workspace/editor").then((module) => module.AtomicCodeMirrorEditor),
  { ssr: false }
)

const INITIAL_MARKDOWN = `# The Saltmere affair

[[npc:n1|Maren]] carries the warning to [[article:a1|Saltmere]], where
[[npc:n9|Ander]] died a season ago.

Type **@** or **[[** below to link someone else from the world web, or rest the
pointer on a pill to preview it.

`

const INITIAL_WORLD: ParticipantLinkWorldSnapshot = {
  options: [
    {
      ref: { kind: "npc", id: "n1", label: "Maren" },
      label: "Maren",
      sublabel: "The Moon · Warlock",
      iconKey: "npc",
    },
    {
      ref: { kind: "article", id: "a1", label: "Saltmere" },
      label: "Saltmere",
      sublabel: "Settlement",
      iconKey: "settlement",
    },
    {
      ref: { kind: "character", id: "c1", label: "Vell" },
      label: "Vell",
      sublabel: "Level 4 · Warrior",
      iconKey: "character",
    },
  ],
  targets: [
    {
      ref: { kind: "npc", id: "n1", label: "Maren" },
      label: "Maren",
      tombstoned: false,
    },
    {
      ref: { kind: "article", id: "a1", label: "Saltmere" },
      label: "Saltmere",
      tombstoned: false,
    },
    {
      ref: { kind: "character", id: "c1", label: "Vell" },
      label: "Vell",
      tombstoned: false,
      shortId: "vell1234",
    },
  ],
}

/**
 * Fake preview payloads (UNN-622): the harness has no campaign, so it injects
 * the loader the way it already injects `mint`. Ander is the interesting row —
 * he is absent from the live world (his pill renders "missing") yet previews as
 * a tombstone, exactly like a deleted NPC still named in a real body.
 */
const SCRATCH_PREVIEWS: Record<string, ParticipantPreview> = {
  "npc:n1": {
    ref: { kind: "npc", id: "n1" },
    name: "Maren",
    tombstoned: false,
    portraitUrl: null,
    sublabel: "The Moon · Warlock",
    summary: null,
    detail: null,
    shortId: null,
    enemies: null,
  },
  "article:a1": {
    ref: { kind: "article", id: "a1" },
    name: "Saltmere",
    tombstoned: false,
    portraitUrl: null,
    sublabel: "Settlement",
    summary: previewSummary(
      "A tidal town built on the bones of a drowned cathedral. The tide-wardens keep the bells dry; everyone else keeps their debts wet, and the harbour master answers to nobody the crown has heard of."
    ),
    detail: null,
    shortId: null,
    enemies: null,
  },
  "character:c1": {
    ref: { kind: "character", id: "c1" },
    name: "Vell",
    tombstoned: false,
    portraitUrl: null,
    sublabel: "Level 4 · Warrior",
    summary: null,
    detail: null,
    shortId: null,
    enemies: null,
  },
  "npc:n9": {
    ref: { kind: "npc", id: "n9" },
    name: "Ander Quill",
    tombstoned: true,
    portraitUrl: null,
    sublabel: "The Hanged Man · Human",
    summary: null,
    detail: null,
    shortId: null,
    enemies: null,
  },
}

/** Interactive scratch surface for the participant-link layer (P1 chips, P3 hover previews). */
export default function ParticipantLinksHarnessPage() {
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN)
  const [marenName, setMarenName] = useState("Maren")
  const [lastNavigation, setLastNavigation] = useState<string | null>(null)
  const [world] = useState(() => createParticipantLinkWorld(INITIAL_WORLD))
  const extensions = useMemo(() => {
    let mintSequence = 0
    return createParticipantLinkExtensions({
      campaignId: "scratch-campaign",
      campaignShortId: "scratch",
      world,
      navigate: setLastNavigation,
      debounceMs: 0,
      mint: async (kind, _campaignId, name): Promise<ParticipantRef> => ({
        kind,
        id: `scratch-${kind}-${++mintSequence}`,
        label: name,
      }),
      preview: async (ref) => SCRATCH_PREVIEWS[`${ref.kind}:${ref.id}`] ?? null,
    })
  }, [world])

  function toggleMarenName() {
    const next = marenName === "Maren" ? "Captain Maren" : "Maren"
    const snapshot = world.getSnapshot()
    world.replace({
      options: snapshot.options.map((option) =>
        option.ref.kind === "npc" && option.ref.id === "n1"
          ? { ...option, ref: { ...option.ref, label: next }, label: next }
          : option
      ),
      targets: snapshot.targets.map((target) =>
        target.ref.kind === "npc" && target.ref.id === "n1"
          ? { ...target, ref: { ...target.ref, label: next }, label: next }
          : target
      ),
    })
    setMarenName(next)
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 sm:p-10">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[11px] tracking-[0.16em] text-gold uppercase">
          Obsidian editor · P1 harness
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl leading-none text-foreground">
              Participant links
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Type @ or [[, choose a world row, then rename Maren without
              remounting the editor.
            </p>
          </div>
          <Button variant="outline" onClick={toggleMarenName}>
            {marenName === "Maren" ? "Rename Maren" : "Restore Maren"}
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
          <span className="text-xs font-medium text-muted-foreground">
            Session notes
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            markdown is storage
          </span>
        </div>
        <div className="min-h-80 p-6 sm:p-8">
          <AtomicCodeMirrorEditor
            documentId="participant-links-p1"
            markdownSource={INITIAL_MARKDOWN}
            onMarkdownChange={setMarkdown}
            extensions={extensions}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-xl">Read-only rendering</h2>
          <Prose>{markdown}</Prose>
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-xl">Harness signals</h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Live world name</dt>
              <dd>{marenName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last pill click</dt>
              <dd className="font-mono text-xs">
                {lastNavigation ?? "No navigation yet"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}
