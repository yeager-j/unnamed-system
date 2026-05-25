"use client"

import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { MarkdownField } from "@/components/editor/markdown-field"
import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import type { Result } from "@/lib/game/result"

import type { EntryMutationResult, EntryRow } from "./entry-list-editor"

/**
 * Large Dialog wrapper around the per-entry title + description editor used
 * by the Step-3 Knives/Chains list. Mounted at the FieldSet level so a row
 * remount on the table (cross-tab broadcast, prop sync) doesn't kill the
 * in-flight editor. The `key` on the dialog at the parent is the open
 * entry's id so the `useDebouncedAutoSave` hooks inside re-initialize when
 * the player opens a different row.
 *
 * The dialog overrides shadcn's default `sm:max-w-sm` to take up most of
 * the viewport — narrative writing wants room to breathe. UNN-211 replaces
 * this with a dedicated full-width writer view.
 */
export function EntryEditDialog({
  characterId,
  identityVersion,
  entry,
  singularLabel,
  titlePlaceholder,
  descriptionPlaceholder,
  saveError,
  updateTitle,
  updateDescription,
  onClose,
}: {
  characterId: string
  identityVersion: number
  entry: EntryRow | null
  singularLabel: string
  titlePlaceholder: string
  descriptionPlaceholder: string
  saveError: string
  updateTitle: (
    entryId: string,
    title: string,
    expectedVersion: number
  ) => Promise<Result<EntryMutationResult, string>>
  updateDescription: (
    entryId: string,
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<EntryMutationResult, string>>
  onClose: () => void
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(calc(100%-2rem),64rem)] flex-col gap-4 p-6 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Edit {singularLabel}</DialogTitle>
          <DialogDescription>
            Edits auto-save. Use Markdown shortcuts (`# `, `- `, `**bold**`) or
            paste a URL to autolink.
          </DialogDescription>
        </DialogHeader>

        {entry ? (
          <EntryEditForm
            characterId={characterId}
            identityVersion={identityVersion}
            entry={entry}
            titlePlaceholder={titlePlaceholder}
            descriptionPlaceholder={descriptionPlaceholder}
            saveError={saveError}
            updateTitle={updateTitle}
            updateDescription={updateDescription}
          />
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EntryEditForm({
  characterId,
  identityVersion,
  entry,
  titlePlaceholder,
  descriptionPlaceholder,
  saveError,
  updateTitle,
  updateDescription,
}: {
  characterId: string
  identityVersion: number
  entry: EntryRow
  titlePlaceholder: string
  descriptionPlaceholder: string
  saveError: string
  updateTitle: (
    entryId: string,
    title: string,
    expectedVersion: number
  ) => Promise<Result<EntryMutationResult, string>>
  updateDescription: (
    entryId: string,
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<EntryMutationResult, string>>
}) {
  const onError = () => toast.error(saveError)

  const title = useDebouncedAutoSave({
    serverValue: entry.title,
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    isEmpty: (v) => v.trim().length === 0,
    onError,
    save: async (next, expectedVersion) => {
      const result = await updateTitle(entry.id, next.trim(), expectedVersion)
      if (result.ok) {
        return {
          ok: true,
          value: { value: next.trim(), version: result.value.version },
        }
      }
      return result
    },
  })

  const description = useDebouncedAutoSave({
    serverValue: entry.description ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    onError,
    save: async (next, expectedVersion) => {
      const normalized = next.trim().length === 0 ? null : next
      const result = await updateDescription(
        entry.id,
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

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <Field>
        <FieldLabel htmlFor={`dialog-title-${entry.id}`}>Title</FieldLabel>
        <Input
          id={`dialog-title-${entry.id}`}
          type="text"
          autoFocus
          placeholder={titlePlaceholder}
          value={title.value}
          onChange={(event) => title.setValue(event.target.value)}
          onFocus={() => title.onFocusChange(true)}
          onBlur={() => title.onFocusChange(false)}
        />
      </Field>

      <Field className="flex-1 overflow-hidden">
        <FieldLabel>Description</FieldLabel>
        <div className="flex-1 overflow-y-auto">
          <MarkdownField
            ariaLabel={`${title.value || titlePlaceholder} — description`}
            placeholder={descriptionPlaceholder}
            value={description.value}
            onChange={description.setValue}
            onFocus={() => description.onFocusChange(true)}
            onBlur={() => description.onFocusChange(false)}
            className="h-full"
          />
        </div>
      </Field>
    </div>
  )
}
