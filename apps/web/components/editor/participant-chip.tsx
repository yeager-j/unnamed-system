"use client"

import { Node, type MarkdownToken } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"

import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import {
  CHIP_TOKEN_SOURCE,
  sanitizeChipLabel,
  serializeChipToken,
} from "@/domain/planner/chip"
import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"

/**
 * The inline **participant chip** Node (tech-design D7): the editor embodiment
 * of a `[[kind:id|label]]` token. An atom — the caret steps over it, backspace
 * removes it whole — whose pill renders the label captured at insert time (the
 * id stays authoritative; read-only surfaces re-resolve the current name, an
 * accepted in-editor staleness).
 *
 * Markdown round-tripping rides `@tiptap/markdown`'s extension hooks: the
 * custom marked tokenizer claims `[[…]]` before the link tokenizer (via its
 * `start` hint), `parseMarkdown` lifts the token into this node, and
 * `renderMarkdown` re-emits it through {@link serializeChipToken} — which
 * sanitizes the label, keeping the emitted markdown byte-deterministic (the
 * `MarkdownField` echo-reset guard compares markdown strings). A malformed or
 * unknown-kind token never tokenizes and stays plain text.
 */
export const ParticipantChip = Node.create({
  name: "participantChip",

  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: "article" },
      id: { default: "" },
      label: { default: "" },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-participant-chip]" }]
  },

  renderHTML({ node }) {
    return [
      "span",
      {
        "data-participant-chip": "",
        "data-kind": node.attrs.kind as string,
        "data-id": node.attrs.id as string,
      },
      node.attrs.label as string,
    ]
  },

  renderText({ node }) {
    return chipRefOf(node.attrs)
      ? serializeChipToken(chipRefOf(node.attrs)!)
      : ""
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChipPill)
  },

  markdownTokenName: "participantChip",

  markdownTokenizer: {
    name: "participantChip",
    level: "inline",
    start: "[[",
    tokenize(src) {
      const match = new RegExp(`^${CHIP_TOKEN_SOURCE}`).exec(src)
      if (match === null) return undefined
      const [raw, kind, id, label] = match
      if (id!.trim() === "") return undefined
      return { type: "participantChip", raw, kind, id, label }
    },
  },

  parseMarkdown(token: MarkdownToken) {
    return {
      type: "participantChip",
      attrs: { kind: token.kind, id: token.id, label: token.label },
    }
  },

  renderMarkdown(node) {
    const ref = chipRefOf(node.attrs ?? {})
    return ref ? serializeChipToken(ref) : ""
  },
})

function chipRefOf(attrs: Record<string, unknown>): ParticipantRef | null {
  const { kind, id, label } = attrs
  if (typeof kind !== "string" || typeof id !== "string" || id === "") {
    return null
  }
  return {
    kind: kind as ParticipantKind,
    id,
    label: typeof label === "string" ? label : "",
  }
}

function ChipPill({ node }: NodeViewProps) {
  const kind = node.attrs.kind as ParticipantKind
  const label = sanitizeChipLabel((node.attrs.label as string) ?? "")
  const Icon = PARTICIPANT_KIND_ICONS[kind] ?? PARTICIPANT_KIND_ICONS.article
  return (
    <NodeViewWrapper
      as="span"
      data-participant-chip=""
      data-kind={kind}
      className={cn(
        // The handoff's `.elink` pill: NPCs in the primary indigo tint,
        // articles/characters muted; not-prose opts out of prose margins.
        "not-prose inline-flex max-w-60 items-center gap-1 rounded-full px-2 py-0.5 align-baseline text-[0.85em] font-medium",
        kind === "npc"
          ? "bg-primary/16 text-primary-text"
          : "bg-muted/55 text-foreground"
      )}
    >
      <Icon aria-hidden className="size-[1em] shrink-0" />
      <span className="truncate">{label || "Unknown"}</span>
    </NodeViewWrapper>
  )
}
