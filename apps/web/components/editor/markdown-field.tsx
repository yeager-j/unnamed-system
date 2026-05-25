"use client"

import { Placeholder } from "@tiptap/extension-placeholder"
import Typography from "@tiptap/extension-typography"
import { Markdown } from "@tiptap/markdown"
import { EditorContent, useEditor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { useEffect, useRef } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Tiptap-backed Markdown editor (ADR-001). Reads and writes plain CommonMark,
 * so it round-trips with the `react-markdown` renderer on the public sheet
 * without any glue.
 *
 * Deliberately chrome-free: no toolbar, no bubble menu, no slash menu — the
 * "Obsidian editor" experience. The player formats with Markdown shortcuts
 * (`# `, `- `, `**bold**`, `[text](url)`, `---`, …) and keyboard shortcuts
 * (`Cmd/Ctrl+B` / `Cmd/Ctrl+I` / `Cmd/Ctrl+E` / `Cmd/Ctrl+Shift+8` / …) that
 * Tiptap's StarterKit ships by default. An Insert menubar for tables /
 * images / a link dialog is a follow-up.
 *
 * **Controlled component.** This file owns the editor instance and the prose
 * surface; persistence (debounce, optimistic concurrency, cross-tab sync) is
 * the caller's problem. Wrap with {@link useDebouncedAutoSave} the same way
 * `EditableName` wraps a plain `<Input>`.
 *
 * **External-value sync.** When the parent passes a new `value` (server
 * refresh, cross-tab broadcast, prop-driven revert), the field updates the
 * editor *only* if the player isn't focused and the new value actually
 * differs from what's already rendered. The focused guard avoids trampling
 * a mid-keystroke draft; the differs guard avoids an infinite update loop
 * (our own `onUpdate` already fed this value back up via `onChange`).
 *
 * Tiptap requires `immediatelyRender: false` under the App Router to avoid
 * the SSR/CSR hydration mismatch its docs document.
 */
export function MarkdownField({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string
  onChange: (markdown: string) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  ariaLabel: string
  className?: string
}) {
  // Stash the latest callbacks in refs so the Tiptap editor — which is a
  // long-lived JS object, not a React effect — always invokes the current
  // version without us having to re-create the editor on every render.
  // Assigning the refs in an effect keeps render pure.
  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  useEffect(() => {
    onChangeRef.current = onChange
    onFocusRef.current = onFocus
    onBlurRef.current = onBlur
  }, [onChange, onFocus, onBlur])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        },
      }),
      Markdown,
      Placeholder.configure({
        placeholder: placeholder ?? "",
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:text-muted-foreground before:float-left before:pointer-events-none before:h-0",
      }),
      Typography,
    ],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        // Mirror the shadcn Textarea's content-area metrics (`min-h-16`,
        // `px-2.5 py-2`, `outline-none`) so a player switching between an
        // Input, a Textarea, and a MarkdownField sees a consistent surface.
        // Prose styling layers the rich-text typography on top of the same
        // base box.
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-16 px-2.5 py-2 outline-none min-h-64",
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current(editor.getMarkdown())
    },
    onFocus() {
      onFocusRef.current?.()
    },
    onBlur() {
      onBlurRef.current?.()
    },
  })

  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    if (editor.getMarkdown() === value) return
    editor.commands.setContent(value, {
      emitUpdate: false,
      contentType: "markdown",
    })
  }, [editor, value])

  return (
    <EditorContent
      editor={editor}
      className={cn(
        // Outer wrapper mirrors the shadcn Textarea's surface — same border,
        // bg, focus ring, and dark-mode inversion — so the MarkdownField
        // reads as a richer Textarea rather than a different control.
        // contentEditable doesn't trigger `:focus-visible` the same way as
        // an `<input>`/`<textarea>`, so the ring rides on `focus-within`
        // (any caret/selection inside the prose surface counts).
        "w-full rounded-none border border-input bg-transparent text-xs transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        // Placeholder copy (from the Tiptap Placeholder extension) is shown
        // via the `is-editor-empty` class on the first paragraph; its
        // styling lives on the extension's `emptyEditorClass` above.
        className
      )}
    />
  )
}
