import { syntaxTree } from "@codemirror/language"
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state"
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"

import { CHIP_TOKEN_SOURCE, parseChipToken } from "@/domain/planner/chip"
import {
  fallbackParticipantLabel,
  PARTICIPANT_KINDS,
  type ParticipantKind,
  type ParticipantRef,
} from "@/domain/planner/participant"

import type { ParticipantLinkWorld } from "./participant-links"

const CODE_NODE_NAMES = new Set(["InlineCode", "FencedCode", "CodeBlock"])
const participantWorldChanged = StateEffect.define<void>()

type ParticipantLinkStatus = "resolved" | "tombstoned" | "missing"

class ParticipantLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly label: string,
    private readonly status: ParticipantLinkStatus
  ) {
    super()
  }

  override eq(other: ParticipantLinkWidget): boolean {
    return (
      this.target === other.target &&
      this.label === other.label &&
      this.status === other.status
    )
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-atomic-wiki-link cm-participant-link"
    span.dataset.wikiLinkTarget = this.target
    span.dataset.participantStatus = this.status
    span.textContent = this.label
    return span
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * Replaces participant-token aliases with live world-web pills. atomic-editor
 * v0.6.2 deliberately skips `resolve` for aliased wiki links, so this app-side
 * field owns only that missing behavior while `wikiLinks` keeps edit/click
 * semantics.
 */
export function participantLinkDecorations(
  world: ParticipantLinkWorld
): Extension {
  const field = StateField.define<DecorationSet>({
    create: (state) => buildParticipantDecorations(state, world),
    update: (decorations, transaction) => {
      const worldChanged = transaction.effects.some((effect) =>
        effect.is(participantWorldChanged)
      )
      if (transaction.docChanged || transaction.selection || worldChanged) {
        return buildParticipantDecorations(transaction.state, world)
      }
      return decorations.map(transaction.changes)
    },
    provide: (value) => EditorView.decorations.from(value),
  })

  const subscription = ViewPlugin.define((view) => {
    const unsubscribe = world.subscribe(() => {
      view.dispatch({ effects: participantWorldChanged.of(undefined) })
    })
    return { destroy: unsubscribe }
  })

  return [field, subscription]
}

function buildParticipantDecorations(
  state: EditorState,
  world: ParticipantLinkWorld
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const targets = new Map(
    world
      .getSnapshot()
      .targets.map((target) => [participantTargetOf(target.ref), target])
  )
  const source = state.doc.toString()

  for (const match of source.matchAll(new RegExp(CHIP_TOKEN_SOURCE, "g"))) {
    const token = match[0]
    const from = match.index
    const to = from + token.length
    const ref = parseChipToken(token)
    if (
      ref === null ||
      selectionTouches(state, from, to) ||
      isPositionInsideCode(state, from)
    ) {
      continue
    }

    const targetKey = participantTargetOf(ref)
    const target = targets.get(targetKey)
    const status: ParticipantLinkStatus = target
      ? target.tombstoned
        ? "tombstoned"
        : "resolved"
      : "missing"
    const label =
      target?.label.trim() ||
      ref.label?.trim() ||
      fallbackParticipantLabel(ref.kind)

    builder.add(
      from,
      to,
      Decoration.replace({
        widget: new ParticipantLinkWidget(targetKey, label, status),
      })
    )
  }

  return builder.finish()
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from
  )
}

export function isPositionInsideCode(
  state: EditorState,
  position: number
): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1)
  while (node !== null) {
    if (CODE_NODE_NAMES.has(node.name)) return true
    node = node.parent
  }
  return false
}

export function participantTargetOf(ref: { kind: string; id: string }): string {
  return `${ref.kind}:${ref.id}`
}

/** The inverse of {@link participantTargetOf} — a pill's `data-wiki-link-target` back to a ref. */
export function parseParticipantTarget(target: string): ParticipantRef | null {
  const separator = target.indexOf(":")
  if (separator <= 0) return null
  const kind = target.slice(0, separator)
  const id = target.slice(separator + 1)
  if (id === "") return null
  return PARTICIPANT_KINDS.some((candidate) => candidate === kind)
    ? { kind: kind as ParticipantKind, id }
    : null
}
