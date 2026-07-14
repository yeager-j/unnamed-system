"use client"

import type { Extension } from "@codemirror/state"
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view"
import { createRoot, type Root } from "react-dom/client"

import {
  HoverCard,
  HoverCardContent,
} from "@workspace/ui/components/hover-card"

import { ParticipantPreviewCard } from "@/components/shared/participant-preview-card"
import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import type { ParticipantPreview } from "@/domain/planner/participant-preview"
import type { ParticipantPreviewState } from "@/domain/planner/use-participant-preview"

import {
  parseParticipantTarget,
  participantTargetOf,
} from "./participant-link-decorations"
import type { ParticipantLinkWorld } from "./participant-links"

/** How long a pointer must rest on a pill before its card opens — and therefore fetches. */
const DEFAULT_HOVER_DELAY_MS = 300

export interface ParticipantHoverConfig {
  world: ParticipantLinkWorld
  loadPreview: (ref: ParticipantRef) => Promise<ParticipantPreview | null>
  hoverDelayMs?: number
}

/**
 * The editor's half of the chip hover preview (UNN-622): a pointer resting on a
 * `[data-wiki-link-target]` pill opens the same {@link ParticipantPreviewCard}
 * the display path's pill does.
 *
 * Structurally the completion menu's bridge pointed at a pill instead of the
 * caret — one detached React root per editor, positioned with floating-ui. Two
 * disciplines it inherits: the root unmounts on a microtask (a nested root may
 * not unmount inside the parent's lifecycle), and the plugin **never dispatches
 * into the editor**, so no in-flight preview can stall or disturb typing.
 *
 * The card itself is inert (`pointer-events: none`, `aria-hidden`): it repeats
 * what a click on the pill would show, and clicking is still what keyboard and
 * touch users do.
 */
export function participantLinkHoverPreview(
  config: ParticipantHoverConfig
): Extension {
  return ViewPlugin.define((view) => new ParticipantHoverBridge(view, config))
}

interface HoveredParticipant {
  pill: HTMLElement
  kind: ParticipantKind
  label?: string
  tombstoned?: boolean
}

class ParticipantHoverBridge {
  private readonly container = document.createElement("div")
  private readonly root: Root
  private hovered: HoveredParticipant | null = null
  private state: ParticipantPreviewState = { status: "loading" }
  private openTimer: number | null = null
  /** Bumped on every open/close so a late fetch for a stale pill can't render. */
  private generation = 0
  /** A preview can still be in flight when the editor goes; nothing may render into a dead root. */
  private destroyed = false

  constructor(
    private readonly view: EditorView,
    private readonly config: ParticipantHoverConfig
  ) {
    this.container.dataset.participantPreviewRoot = ""
    document.body.append(this.container)
    this.root = createRoot(this.container)
    this.view.dom.addEventListener("mouseover", this.onMouseOver)
    this.view.dom.addEventListener("mouseout", this.onMouseOut)
    this.render()
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) this.close()
  }

  destroy(): void {
    this.clearTimer()
    this.destroyed = true
    this.view.dom.removeEventListener("mouseover", this.onMouseOver)
    this.view.dom.removeEventListener("mouseout", this.onMouseOut)
    queueMicrotask(() => {
      this.root.unmount()
      this.container.remove()
    })
  }

  private readonly onMouseOver = (event: MouseEvent): void => {
    const pill = pillOf(event.target)
    if (pill === null || pill === this.hovered?.pill) return

    this.close()
    this.openTimer = window.setTimeout(
      () => this.open(pill),
      this.config.hoverDelayMs ?? DEFAULT_HOVER_DELAY_MS
    )
  }

  private readonly onMouseOut = (event: MouseEvent): void => {
    const pill = pillOf(event.target)
    if (pill === null) return
    const next = event.relatedTarget
    if (next instanceof Node && pill.contains(next)) return
    this.close()
  }

  private open(pill: HTMLElement): void {
    const target = pill.dataset.wikiLinkTarget
    const ref = target === undefined ? null : parseParticipantTarget(target)
    if (ref === null) return

    const known = this.config.world
      .getSnapshot()
      .targets.find(
        (candidate) => participantTargetOf(candidate.ref) === target
      )

    const generation = ++this.generation
    this.hovered = {
      pill,
      kind: ref.kind,
      label: known?.label,
      tombstoned: known?.tombstoned,
    }
    this.state = { status: "loading" }
    this.render()

    void this.config.loadPreview(ref).then((preview) => {
      if (generation !== this.generation) return
      this.state =
        preview === null ? { status: "missing" } : { status: "ready", preview }
      this.render()
    })
  }

  private close(): void {
    this.clearTimer()
    this.generation += 1
    this.hovered = null
    this.render()
  }

  private clearTimer(): void {
    if (this.openTimer === null) return
    window.clearTimeout(this.openTimer)
    this.openTimer = null
  }

  private render(): void {
    if (this.destroyed) return
    const hovered = this.hovered
    this.root.render(
      hovered === null ? null : (
        <ParticipantHoverPanel
          pill={hovered.pill}
          kind={hovered.kind}
          label={hovered.label}
          tombstoned={hovered.tombstoned}
          state={this.state}
        />
      )
    )
  }
}

/**
 * The card, anchored to a pill CodeMirror owns. The trigger half of a
 * `HoverCard` can't be used — Base UI triggers must be React-rendered, and
 * these pills are `WidgetType` DOM — so the bridge above owns hover intent and
 * open state, and hands the element to the positioner as a foreign `anchor`.
 * The popup itself (chrome, portal, placement, animation) is the house one, so
 * an editor pill and a prose pill preview identically.
 */
function ParticipantHoverPanel({
  pill,
  kind,
  label,
  tombstoned,
  state,
}: {
  pill: HTMLElement
  kind: ParticipantKind
  label?: string
  tombstoned?: boolean
  state: ParticipantPreviewState
}) {
  return (
    <HoverCard open>
      <HoverCardContent
        anchor={pill}
        side="top"
        aria-hidden="true"
        data-participant-preview-card=""
        className="pointer-events-none"
      >
        <ParticipantPreviewCard
          kind={kind}
          label={label}
          tombstoned={tombstoned}
          state={state}
        />
      </HoverCardContent>
    </HoverCard>
  )
}

function pillOf(eventTarget: EventTarget | null): HTMLElement | null {
  if (!(eventTarget instanceof HTMLElement)) return null
  return eventTarget.closest<HTMLElement>("[data-wiki-link-target]")
}
