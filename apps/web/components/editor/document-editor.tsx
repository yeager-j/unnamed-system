"use client"

import type { Extension } from "@codemirror/state"

import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"

import { MarkdownField } from "@/components/editor/markdown-field"

/**
 * The slice of an autosave field a document surface hands the shell — the
 * structural subset of `UseDebouncedAutoSaveReturn<string>`, which both
 * persistence pipelines already produce (`useCharacterEntityAutoSave` for the entity
 * door, the planner's LWW composition for beats). A caller that needs a
 * side effect per keystroke (the Notes tree's title mirror) wraps `setValue`
 * before passing the state in.
 */
export interface DocumentFieldState {
  value: string
  setValue: (next: string) => void
  onFocusChange: (focused: boolean) => void
}

export interface DocumentEditorMessages {
  /** Aria label for the body editor. Should describe the document. */
  bodyAriaLabel: string
  /** Placeholder shown in the body editor when empty. */
  bodyPlaceholder: string
  /** Placeholder shown when the title is empty. */
  titlePlaceholder?: string
  /** Aria label for the subtitle field (required when `subtitle` is passed). */
  subtitleAriaLabel?: string
  /** Placeholder shown when the subtitle is empty. */
  subtitlePlaceholder?: string
  /**
   * Optional guidance rendered between the header block and the divider —
   * the builder pulls each document's framing from the rulebook here.
   */
  description?: string
}

/**
 * The shared **document editor shell** (UNN-576): a borderless display-font
 * title (+ optional subtitle line) over a divider and a chrome-free Markdown
 * body — the "reads like a document, not a form" surface both the builder's
 * Movement-3 writer and Session Notes render, and phase 6's Article/NPC
 * pages inherit.
 *
 * **Presentation only, storage-blind.** Persistence stays with the caller:
 * each field arrives as a {@link DocumentFieldState} produced by whichever
 * autosave pipeline owns the surface (entity door vs LWW server actions —
 * deliberately different, D6/D10). The shell wires values, focus/blur, a11y
 * ids, and styling; it never dispatches a write.
 */
export function DocumentEditor({
  documentId,
  title,
  titleReadOnly = false,
  subtitle,
  body,
  extensions,
  messages,
}: {
  /**
   * Stable per-document id used to seed the element ids for label
   * association. Avoids cross-document `htmlFor` collisions when the
   * editor remounts on doc swap.
   */
  documentId: string
  title: DocumentFieldState
  /** Renders the title `readOnly` (fixed section names — Backstory, Identity Traits). */
  titleReadOnly?: boolean
  /** The optional second header line (a beat's tagline). */
  subtitle?: DocumentFieldState
  body: DocumentFieldState
  /** Extra CodeMirror extensions for the body (chips + suggestions). Must be render-stable. */
  extensions?: readonly Extension[]
  messages: DocumentEditorMessages
}) {
  const titleInputId = `document-title-${documentId}`
  const subtitleInputId = `document-subtitle-${documentId}`
  const bodyLabelId = `document-body-label-${documentId}`

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <Field>
        <FieldLabel htmlFor={titleInputId} className="sr-only">
          Title
        </FieldLabel>
        <Input
          id={titleInputId}
          type="text"
          autoComplete="off"
          readOnly={titleReadOnly}
          placeholder={messages.titlePlaceholder ?? ""}
          value={title.value}
          onChange={(event) => title.setValue(event.target.value)}
          onFocus={() => title.onFocusChange(true)}
          onBlur={() => title.onFocusChange(false)}
          className="h-auto rounded-none border-0 bg-transparent px-0 font-display text-2xl font-semibold text-foreground shadow-none placeholder:text-muted-foreground read-only:cursor-default focus-visible:border-0 focus-visible:ring-0 sm:text-3xl md:text-3xl dark:bg-transparent"
        />
        {subtitle ? (
          <>
            <FieldLabel htmlFor={subtitleInputId} className="sr-only">
              {messages.subtitleAriaLabel ?? "Subtitle"}
            </FieldLabel>
            <Textarea
              id={subtitleInputId}
              rows={1}
              autoComplete="off"
              placeholder={messages.subtitlePlaceholder ?? ""}
              value={subtitle.value}
              onChange={(event) => subtitle.setValue(event.target.value)}
              onFocus={() => subtitle.onFocusChange(true)}
              onBlur={() => subtitle.onFocusChange(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault()
              }}
              className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-0 text-base text-muted-foreground shadow-none placeholder:text-muted-foreground/50 focus-visible:border-0 focus-visible:ring-0 md:text-base dark:bg-transparent"
            />
          </>
        ) : null}
        {messages.description ? (
          <FieldDescription>{messages.description}</FieldDescription>
        ) : null}
        <Separator />
      </Field>

      <Field className="flex-1 overflow-hidden">
        <Label id={bodyLabelId} className="sr-only">
          {messages.bodyAriaLabel}
        </Label>
        <div className="flex-1 overflow-y-auto">
          <MarkdownField
            ariaLabel={messages.bodyAriaLabel}
            ariaLabelledBy={bodyLabelId}
            placeholder={messages.bodyPlaceholder}
            value={body.value}
            onChange={body.setValue}
            onFocus={() => body.onFocusChange(true)}
            onBlur={() => body.onFocusChange(false)}
            extensions={extensions}
            className="h-full rounded-none border-0 bg-transparent text-base focus-within:border-0 focus-within:ring-0 dark:bg-transparent [&_.cm-content]:px-0 [&_.cm-content]:py-0 [&_.cm-editor]:pb-[40vh]"
          />
        </div>
      </Field>
    </div>
  )
}
