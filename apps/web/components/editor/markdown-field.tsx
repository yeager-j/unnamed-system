"use client"

import type { Extension } from "@codemirror/state"
import { placeholder as cmPlaceholder, EditorView } from "@codemirror/view"
import dynamic from "next/dynamic"
import { useEffect, useId, useMemo, useRef } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { emphasisKeymap } from "./emphasis-keymap"

// The vendored editor has no SSR story (it builds a live `EditorView` against
// the DOM at mount), so it loads client-only — the CM6 equivalent of Tiptap's
// `immediatelyRender: false`. The accompanying stylesheet is imported once,
// globally, in `app/layout.tsx`.
const AtomicCodeMirrorEditor = dynamic(
  () =>
    import("@workspace/editor").then((module) => module.AtomicCodeMirrorEditor),
  { ssr: false }
)

/**
 * CodeMirror 6-backed Markdown editor (the "Obsidian editor"). Reads and writes
 * plain CommonMark — the editor's document *is* the markdown, so it round-trips
 * with the `react-markdown` renderer on the public sheet by construction (there
 * is no serializer to drift).
 *
 * Obsidian-style live preview: headings render sized, emphasis/links resolve,
 * tables and task lists render in place, and markdown syntax hides off the
 * active line. The player formats with Markdown shortcuts and the keyboard
 * shortcuts CodeMirror ships.
 *
 * **Controlled component.** This file owns the editor instance; persistence
 * (debounce, optimistic concurrency) is the caller's problem. Wrap with
 * {@link useDebouncedAutoSave} the same way `EditableName` wraps a plain
 * `<Input>`.
 *
 * **Single-author, seed-once.** `value` seeds the document at mount and nothing
 * pushes it back in afterward: the editor is the sole author of its buffer for
 * its lifetime. Every markdown field today has exactly one live author, so
 * there is no external update to reconcile — the autosave pipeline writes out,
 * never in. A document swap remounts the field (the consumer keys it), which
 * re-seeds from the new `value`. If concurrent authoring is ever needed, the
 * write path's version tokens are where reconciliation belongs — not a
 * value-diffing effect that would race in-flight edits.
 */
export function MarkdownField({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  ariaLabel,
  ariaLabelledBy,
  className,
  extensions,
}: {
  value: string
  onChange: (markdown: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  ariaLabel: string
  /**
   * Optional id of a labeling element. When set, the editor's contenteditable
   * surface is wired with `aria-labelledby` alongside `aria-label`, so users
   * navigating by labels jump to this field when the label is selected.
   */
  ariaLabelledBy?: string
  className?: string
  /**
   * Extra CodeMirror extensions appended to the base set (e.g. the participant
   * chip layer). Captured once at mount, so must be render-stable — pass a
   * `useMemo`'d array.
   */
  extensions?: readonly Extension[]
}) {
  // Stash focus/blur in refs so the mount-captured DOM handlers always invoke
  // the current callback without re-creating the editor. Assigning in an effect
  // keeps render pure (the markdown-field callback-ref pattern).
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  useEffect(() => {
    onFocusRef.current = onFocus
    onBlurRef.current = onBlur
  }, [onFocus, onBlur])

  // A stable identity so the editor mounts once for this field's lifetime: the
  // vendored editor keys its view on `documentId`, reading `markdownSource`
  // only at mount. With a stable id, later `value` changes never remount (they
  // originate from the editor itself); a document swap remounts the whole field
  // via the consumer's `key`, minting a fresh id that re-seeds from `value`.
  const editorId = useId()

  const baseExtensions = useMemo(() => {
    const base: Extension[] = [
      emphasisKeymap,
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        ...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {}),
      }),
      // The vendored component has no focus/blur props; drive the caller's
      // focus/blur (which gate autosave flush) off the content DOM's events.
      EditorView.domEventHandlers({
        focus: () => {
          onFocusRef.current?.()
        },
        blur: () => {
          onBlurRef.current?.()
        },
      }),
    ]
    if (placeholder) base.push(cmPlaceholder(placeholder))
    return [...base, ...(extensions ?? [])]
  }, [ariaLabel, ariaLabelledBy, placeholder, extensions])

  return (
    <div
      className={cn(
        // Outer wrapper mirrors the shadcn Textarea's surface — same border,
        // bg, focus ring, and dark-mode inversion. contentEditable doesn't
        // trigger `:focus-visible` the way an `<input>` does, so the ring rides
        // on `focus-within`.
        "w-full rounded-md border border-input bg-transparent text-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        // Base content metrics (mirrors the old editor's `px-2.5 py-2` box +
        // min height). `DocumentEditor` zeroes the padding for its borderless
        // look; `create-campaign` shrinks the min height — both via
        // `tailwind-merge` on the same `.cm-content` variant.
        "[&_.cm-content]:min-h-64 [&_.cm-content]:px-2.5 [&_.cm-content]:py-2",
        className
      )}
    >
      <AtomicCodeMirrorEditor
        documentId={editorId}
        markdownSource={value}
        onMarkdownChange={onChange}
        extensions={baseExtensions}
      />
    </div>
  )
}
