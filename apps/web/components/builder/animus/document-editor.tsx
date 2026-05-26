"use client"

import { toast } from "sonner"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { MarkdownField } from "@/components/editor/markdown-field"
import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import type { Result } from "@/lib/game/result"

/**
 * The title + Markdown body pair the Movement 3 writer renders for the
 * active document. Extracted from the original
 * {@link import("../steps/character-origins/entry-edit-dialog.tsx").EntryEditForm}
 * (UNN-207) so the writer and the legacy dialog share one autosave-wiring
 * implementation while UNN-217 deletes the dialog.
 *
 * Two independent `useDebouncedAutoSave` instances drive title and body
 * separately. Both write the identity class — the silent-retry pipeline in
 * `dispatchCharacterWriteWithRetry` handles the version race between them.
 *
 * For documents without a player-editable title (Backstory, Identity
 * Traits), pass `title={null}` — the input is suppressed and the parent
 * is expected to render the fixed serif heading itself.
 */
export interface DocumentEditorMutationResult {
  version: number
}

export interface DocumentEditorActions {
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
  /** Placeholder shown in the title input. Only used when `title !== null`. */
  titlePlaceholder?: string
  /** Toast text on a save failure. */
  saveError: string
}

export function DocumentEditor({
  characterId,
  identityVersion,
  documentId,
  title,
  body,
  actions,
  messages,
}: {
  characterId: string
  identityVersion: number
  /**
   * Stable per-document id used to seed the input element's `id` for label
   * association. Avoids cross-document `htmlFor` collisions when the
   * editor remounts on doc swap.
   */
  documentId: string
  title: string | null
  body: string
  actions: DocumentEditorActions
  messages: DocumentEditorMessages
}) {
  const onError = () => toast.error(messages.saveError)

  const titleState = useDebouncedAutoSave({
    serverValue: title ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    isEmpty: (v) => v.trim().length === 0,
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

  const bodyState = useDebouncedAutoSave({
    serverValue: body,
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
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
      {title !== null ? (
        <Field>
          <FieldLabel htmlFor={titleInputId} className="sr-only">
            Title
          </FieldLabel>
          <Input
            id={titleInputId}
            type="text"
            autoComplete="off"
            placeholder={messages.titlePlaceholder ?? ""}
            value={titleState.value}
            onChange={(event) => titleState.setValue(event.target.value)}
            onFocus={() => titleState.onFocusChange(true)}
            onBlur={() => titleState.onFocusChange(false)}
            className="h-auto rounded-none border-0 bg-transparent px-0 font-heading text-2xl text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 sm:text-3xl md:text-3xl dark:bg-transparent"
          />
        </Field>
      ) : null}

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
