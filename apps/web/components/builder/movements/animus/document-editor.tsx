"use client"

import { toast } from "sonner"

import { type Result } from "@workspace/game/foundation"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

import { MarkdownField } from "@/components/editor/markdown-field"
import { useBuilderAutoSave } from "@/hooks/use-builder-draft"
import type { EditSurface } from "@/lib/db/version-classes"

/**
 * The title + Markdown body pair the Movement 3 writer renders for the
 * active document.
 *
 * Two independent `useBuilderAutoSave` instances drive title and body
 * separately. Both write the identity class and resolve the *same* shared
 * version ref (UNN-274), so the title's bump is visible to the body's next
 * save in-frame — no version race between them.
 *
 * Every document — editable (Knives / Chains) or fixed (Backstory /
 * Identity Traits) — renders the same Input + description + Separator +
 * Markdown body. Fixed documents pass no `updateTitle` action, which
 * flips the input to `readOnly` so the styling and rhythm stay identical
 * across kinds.
 */
export interface DocumentEditorMutationResult {
  version: number
}

export interface DocumentEditorActions {
  /**
   * When omitted, the title input is rendered `readOnly` (Backstory and
   * Identity Traits — the player can't rename the section name).
   */
  updateTitle?: (
    title: string,
    expectedVersion: number
  ) => Promise<Result<DocumentEditorMutationResult, string>>
  updateDescription: (
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<DocumentEditorMutationResult, string>>
}

export interface DocumentEditorMessages {
  /** Aria label for the body editor. Should describe the document. */
  bodyAriaLabel: string
  /** Placeholder shown in the body editor when empty. */
  bodyPlaceholder: string
  /**
   * Placeholder shown when the title is empty. Only meaningful for
   * editable docs (Knives / Chains); fixed docs always have a value.
   */
  titlePlaceholder?: string
  /**
   * Two-to-three sentences of guidance shown between the title and the
   * body editor. Pulled from the rulebook so each document carries its
   * own framing without the player having to look it up.
   */
  description: string
  /** Toast text on a save failure. */
  saveError: string
}

export function DocumentEditor({
  characterId,
  documentId,
  title,
  body,
  actions,
  messages,
  surface,
}: {
  characterId: string
  /**
   * Stable per-document id used to seed the input element's `id` for label
   * association. Avoids cross-document `htmlFor` collisions when the
   * editor remounts on doc swap.
   */
  documentId: string
  title: string
  body: string
  actions: DocumentEditorActions
  messages: DocumentEditorMessages
  surface: EditSurface
}) {
  const onError = () => toast.error(messages.saveError)
  const isTitleEditable = !!actions.updateTitle

  const titleState = useBuilderAutoSave({
    serverValue: title,
    characterId,
    surface,
    isEqual: (a, b) => a.trim() === b.trim(),
    // No `isEmpty` guard — clearing the title is a legitimate edit. The
    // sidebar renders "New Knife" / "New Chain" as a fallback label when
    // the saved title is empty; the editor's own placeholder cues the
    // player to type one.
    onError,
    save: async (next, expectedVersion) => {
      if (!actions.updateTitle) {
        return { ok: true, value: { value: next, version: expectedVersion } }
      }
      const result = await actions.updateTitle(next.trim(), expectedVersion)
      if (result.ok) {
        return {
          ok: true,
          value: { value: next.trim(), version: result.value.version },
        }
      }
      return result
    },
  })

  const bodyState = useBuilderAutoSave({
    serverValue: body,
    characterId,
    surface,
    isEqual: (a, b) => a.trim() === b.trim(),
    onError,
    save: async (next, expectedVersion) => {
      const normalized = next.trim().length === 0 ? null : next
      const result = await actions.updateDescription(
        normalized,
        expectedVersion
      )
      if (result.ok) {
        return {
          ok: true,
          value: { value: next, version: result.value.version },
        }
      }
      return result
    },
  })

  const titleInputId = `writer-title-${documentId}`
  const bodyLabelId = `writer-body-label-${documentId}`

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
          readOnly={!isTitleEditable}
          placeholder={messages.titlePlaceholder ?? ""}
          value={titleState.value}
          onChange={(event) => titleState.setValue(event.target.value)}
          onFocus={() => titleState.onFocusChange(true)}
          onBlur={() => titleState.onFocusChange(false)}
          className="h-auto rounded-none border-0 bg-transparent px-0 font-display text-2xl font-semibold text-foreground shadow-none placeholder:text-muted-foreground read-only:cursor-default focus-visible:border-0 focus-visible:ring-0 sm:text-3xl md:text-3xl dark:bg-transparent"
        />
        <FieldDescription>{messages.description}</FieldDescription>
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
            value={bodyState.value}
            onChange={bodyState.setValue}
            onFocus={() => bodyState.onFocusChange(true)}
            onBlur={() => bodyState.onFocusChange(false)}
            className="h-full rounded-none border-0 bg-transparent text-base focus-within:border-0 focus-within:ring-0 dark:bg-transparent [&_.ProseMirror]:px-0 [&_.ProseMirror]:py-0"
          />
        </div>
      </Field>
    </div>
  )
}
