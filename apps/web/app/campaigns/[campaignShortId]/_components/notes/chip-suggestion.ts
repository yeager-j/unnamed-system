import { Extension, type AnyExtension } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { Suggestion } from "@tiptap/suggestion"
import type { RefObject } from "react"

import { sanitizeChipLabel } from "@/domain/planner/chip"
import type { ParticipantRef } from "@/domain/planner/participant"
import {
  filterLinkerOptions,
  type LinkerOption,
} from "@/domain/planner/view/linker"

/** How many world-web rows the suggestion popover shows at most. */
const MAX_SUGGESTIONS = 8

/**
 * One open suggestion session, as the popover sees it: the query typed so
 * far, the filtered world-web rows, the caret rect to anchor to, and the
 * `command` that inserts the picked chip and closes the session.
 */
export interface ActiveChipSuggestion {
  query: string
  items: LinkerOption[]
  clientRect: (() => DOMRect | null) | null
  command: (ref: ParticipantRef) => void
}

/**
 * The bridge the popover installs for the editor plugins to talk through.
 * `@tiptap/suggestion` drives a render lifecycle from inside ProseMirror;
 * the popover is React — a mutable handle is the seam (the same pattern as
 * `MarkdownField`'s callback refs: the long-lived editor always calls the
 * current handler).
 */
export interface ChipSuggestionHandle {
  onOpen: (session: ActiveChipSuggestion) => void
  onClose: () => void
  /** Return true to consume the key (arrows/enter/escape while open). */
  onKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * Builds the **dual-trigger** chip suggestion extensions (D7): `@` as the
 * one-keystroke primary and `[[` as the Obsidian-muscle-memory alias — two
 * plugin instances, one behavior, identical storage token either way.
 * `options` and `handle` are refs so the render-stable extensions (the
 * editor is created once) always see the current world web and the mounted
 * popover.
 */
export function createChipSuggestionExtensions({
  options,
  handle,
}: {
  options: RefObject<readonly LinkerOption[]>
  handle: RefObject<ChipSuggestionHandle | null>
}): AnyExtension[] {
  return [
    chipSuggestionExtension("chipSuggestionAt", "@", options, handle),
    chipSuggestionExtension("chipSuggestionBrackets", "[[", options, handle),
  ]
}

function chipSuggestionExtension(
  name: string,
  char: string,
  options: RefObject<readonly LinkerOption[]>,
  handle: RefObject<ChipSuggestionHandle | null>
): AnyExtension {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<LinkerOption, ParticipantRef>({
          editor: this.editor,
          pluginKey: new PluginKey(name),
          char,
          allowSpaces: true,
          items: ({ query }) =>
            filterLinkerOptions(options.current ?? [], query).slice(
              0,
              MAX_SUGGESTIONS
            ),
          command: ({ editor, range, props: ref }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "participantChip",
                  attrs: {
                    kind: ref.kind,
                    id: ref.id,
                    label: sanitizeChipLabel(ref.label ?? ""),
                  },
                },
                { type: "text", text: " " },
              ])
              .run()
          },
          render: () => ({
            onStart: (props) => handle.current?.onOpen(toSession(props)),
            onUpdate: (props) => handle.current?.onOpen(toSession(props)),
            onExit: () => handle.current?.onClose(),
            onKeyDown: ({ event }) => handle.current?.onKeyDown(event) ?? false,
          }),
        }),
      ]
    },
  })
}

function toSession(props: {
  query: string
  items: LinkerOption[]
  clientRect?: (() => DOMRect | null) | null
  command: (ref: ParticipantRef) => void
}): ActiveChipSuggestion {
  return {
    query: props.query,
    items: props.items,
    clientRect: props.clientRect ?? null,
    command: props.command,
  }
}
