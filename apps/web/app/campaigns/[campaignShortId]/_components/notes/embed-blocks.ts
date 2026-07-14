import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view"

import { isPositionInsideCode } from "@/components/editor/markdown-code-context"
import {
  fallbackParticipantLabel,
  type ParticipantRef,
} from "@/domain/planner/participant"
import type { ParticipantPreview } from "@/domain/planner/participant-preview"

import { EMBED_CARD_ROUTES, parseEmbedLine } from "../embed-kinds"

/**
 * The **embed-block layer** (UNN-624, embeds mini-design): a line that is
 * exactly one `![[kind:id|label]]` token renders a block card below it, raw
 * markdown revealed while the caret is on the line — the vendored
 * `image-blocks.ts` model, rebuilt app-side because `![[…]]` is not a lezer
 * `Image` node (no `(url)`), so no vendored extension ever touches it.
 *
 * The card is DOM-built for v1 (name, status line, count, click-through);
 * the React-portal upgrade and Ably liveness are deferred by design. Data
 * comes lazily through the shared participant-preview loader — the same
 * cached pipeline the hover cards read — so an embed never bloats page load.
 *
 * On inactive lines the raw token is replaced (hidden) but the line keeps its
 * natural height — collapsing it breaks iOS momentum scroll (the
 * image-blocks lesson). The chip pill's own replace of the inner `[[…]]`
 * nests inside this field's wider replace, and CM6 renders the outer one, so
 * the two fields coexist without coordination.
 */

export interface EmbedBlocksConfig {
  campaignShortId: string
  navigate: (href: string) => void
  loadPreview: (ref: ParticipantRef) => Promise<ParticipantPreview | null>
}

class EmbedCardWidget extends WidgetType {
  constructor(
    private readonly ref: ParticipantRef,
    private readonly config: EmbedBlocksConfig
  ) {
    super()
  }

  override eq(other: EmbedCardWidget): boolean {
    return (
      this.ref.kind === other.ref.kind &&
      this.ref.id === other.ref.id &&
      this.ref.label === other.ref.label
    )
  }

  override toDOM(): HTMLElement {
    const card = document.createElement("div")
    card.className = "cm-embed-card"
    card.dataset.embedKind = this.ref.kind
    card.dataset.embedState = "loading"
    card.setAttribute("role", "link")
    card.tabIndex = 0

    const icon = document.createElement("span")
    icon.className = "cm-embed-card-icon"
    icon.setAttribute("aria-hidden", "true")

    const body = document.createElement("div")
    body.className = "cm-embed-card-body"
    const name = document.createElement("div")
    name.className = "cm-embed-card-name"
    name.textContent = this.capturedLabel()
    const meta = document.createElement("div")
    meta.className = "cm-embed-card-meta"
    meta.textContent = "Loading…"
    body.append(name, meta)
    card.append(icon, body)

    let href: string | null = null
    void this.config.loadPreview(this.ref).then((preview) => {
      if (!card.isConnected) return
      if (preview === null) {
        card.dataset.embedState = "missing"
        meta.textContent = "Not found"
        return
      }
      card.dataset.embedState = "ready"
      name.textContent = preview.name
      meta.textContent = [preview.sublabel, preview.detail]
        .filter((part) => part !== null)
        .join(" · ")
      const route = EMBED_CARD_ROUTES[this.ref.kind]
      if (route && preview.shortId !== null) {
        href = route(this.config.campaignShortId, preview.shortId)
      }
    })

    const open = () => {
      if (href !== null) this.config.navigate(href)
    }
    card.addEventListener("mousedown", (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    card.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      open()
    })
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open()
    })
    return card
  }

  /** The card navigates on click (per AC) — CM6 must not also move the caret. */
  override ignoreEvent(event: Event): boolean {
    return (
      event.type === "mousedown" ||
      event.type === "click" ||
      event.type === "keydown"
    )
  }

  private capturedLabel(): string {
    const captured = this.ref.label?.trim()
    return captured ? captured : fallbackParticipantLabel(this.ref.kind)
  }
}

function buildEmbedDecorations(
  state: EditorState,
  config: EmbedBlocksConfig
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber)
    const ref = parseEmbedLine(line.text)
    if (ref === null) continue

    const trimmed = line.text.trim()
    const tokenFrom = line.from + line.text.indexOf(trimmed)
    if (isPositionInsideCode(state, tokenFrom)) continue

    if (!selectionTouches(state, line.from, line.to)) {
      ranges.push(
        Decoration.replace({}).range(tokenFrom, tokenFrom + trimmed.length)
      )
    }
    ranges.push(
      Decoration.widget({
        widget: new EmbedCardWidget(ref, config),
        block: true,
        side: 1,
      }).range(line.to)
    )
  }
  return Decoration.set(ranges, true)
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from
  )
}

/** The embed StateField (block widgets can't come from a ViewPlugin — the image-blocks constraint). */
export function embedBlocks(config: EmbedBlocksConfig): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => buildEmbedDecorations(state, config),
    update: (decorations, transaction) => {
      if (transaction.docChanged || transaction.selection) {
        return buildEmbedDecorations(transaction.state, config)
      }
      return decorations.map(transaction.changes)
    },
    provide: (value) => EditorView.decorations.from(value),
  })
}
