"use client"

import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useState, useTransition } from "react"
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
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { MarkdownField } from "@/components/editor/markdown-field"
import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { useDebouncedAutoSave } from "@/hooks/use-debounced-auto-save"
import type { Result } from "@/lib/game/result"

/**
 * The shape of one entry the list editor renders — applies equally to a
 * Knife and a Chain row. Kept local to the builder directory because no
 * other UI surface reuses this exact shape; lifting it to a shared module
 * before a third caller exists would be premature.
 */
export interface EntryRow {
  id: string
  title: string
  description: string | null
}

export interface EntryListMessages {
  /** Section heading (e.g. "Knives", "Chains"). */
  label: string
  /** Short rules excerpt rendered under the heading. */
  description: string
  /** Singular noun used in the empty-row title placeholder + dialog header (e.g. "Knife"). */
  singularLabel: string
  /** Per-entry title placeholder (the `placeholder=` attribute shown when the title is empty). */
  titlePlaceholder: string
  /** Description placeholder for the MarkdownField in the edit dialog. */
  descriptionPlaceholder: string
  /**
   * The seed title persisted when the player clicks Add — must satisfy the
   * action's `title: min(1)` validator since the schema can't accept empty.
   * Short and obvious ("New Knife") so the placeholder copy stays visible
   * only as `placeholder=` guidance; the player overwrites this immediately.
   */
  newEntryTitle: string
  /** Add-button copy. */
  addLabel: string
  /** Soft-warn text when the player goes above the soft cap (e.g. ">12 will overwhelm your DM"). */
  softWarning: string
  /** Renders the soft-cap warning copy when count > softMax. */
  softMax: number
  /** Lower-bound nudge below this (informational, never blocks). */
  recommendedMin: number
  /** Toast copy on save failure. */
  saveError: string
}

interface EntryActionResult {
  /** New identity version after the bump. */
  version: number
}

interface AddResult extends EntryActionResult {
  id: string
}

/**
 * Table-driven editor for the Step-3 Knives + Chains lists. Each entry is a
 * single row showing only the title and row actions — the editor pulls the
 * Markdown description into a Dialog (UNN-207 chose this shape to scale
 * cleanly past a handful of entries; a follow-up — UNN-211 — replaces the
 * Dialog with a dedicated full-width writer view).
 *
 * Add is optimistic via direct local state (a temp row gets a `pending-`
 * id and is swapped for the server row on success). Remove is optimistic
 * with snapshot-rollback on failure.
 */
export function EntryListEditor({
  characterId,
  identityVersion,
  initialEntries,
  messages,
  addEntry,
  updateEntry,
  removeEntry,
}: {
  characterId: string
  identityVersion: number
  initialEntries: EntryRow[]
  messages: EntryListMessages
  addEntry: (
    title: string,
    expectedVersion: number
  ) => Promise<Result<AddResult, string>>
  updateEntry: (
    entryId: string,
    title: string,
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<EntryActionResult, string>>
  removeEntry: (
    entryId: string,
    expectedVersion: number
  ) => Promise<Result<EntryActionResult, string>>
}) {
  const versionRef = useCharacterTokenRef(identityVersion)
  const [items, setItems] = useState(initialEntries)
  const [syncedFrom, setSyncedFrom] = useState(initialEntries)
  const [pendingMutation, startTransition] = useTransition()
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  // Cross-tab broadcast / sibling re-render: when the prop changes and no
  // mutation is in flight, adopt the new list. Render-time check (React 19
  // "Adjusting state based on props" pattern) so we don't pay an extra
  // render; `syncedFrom` records the prop identity we last adopted so this
  // no-ops on re-renders that aren't prop changes.
  if (initialEntries !== syncedFrom && !pendingMutation) {
    setSyncedFrom(initialEntries)
    setItems(initialEntries)
  }

  function handleAdd() {
    const tempId = `pending-${crypto.randomUUID()}`
    const tempRow: EntryRow = {
      id: tempId,
      title: messages.newEntryTitle,
      description: null,
    }
    setItems((prev) => [...prev, tempRow])
    // Auto-open the dialog on the newly-added row so the player drops
    // straight into editing it — the seeded title is throwaway copy and
    // they'll want to overwrite it immediately.
    setOpenEntryId(tempId)

    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          addEntry(messages.newEntryTitle, expectedVersion),
      })
      if (!result.ok) {
        setItems((prev) => prev.filter((entry) => entry.id !== tempId))
        if (openEntryId === tempId) setOpenEntryId(null)
        toast.error(messages.saveError)
        return
      }
      const realId = result.value.id
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === tempId
            ? {
                id: realId,
                title: messages.newEntryTitle,
                description: null,
              }
            : entry
        )
      )
      // Move the open dialog from the temp id to the real id so the player's
      // edit context survives the swap.
      setOpenEntryId((prev) => (prev === tempId ? realId : prev))
    })
  }

  function handleRemove(id: string) {
    const snapshot = items
    setItems((prev) => prev.filter((entry) => entry.id !== id))
    if (openEntryId === id) setOpenEntryId(null)

    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) => removeEntry(id, expectedVersion),
      })
      if (!result.ok) {
        setItems(snapshot)
        toast.error(messages.saveError)
      }
    })
  }

  const openEntry = items.find((e) => e.id === openEntryId) ?? null

  return (
    <FieldSet>
      <FieldLegend>{messages.label}</FieldLegend>
      <FieldDescription>{messages.description}</FieldDescription>

      {items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((entry) => {
              const isPending = entry.id.startsWith("pending-")
              return (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.title}
                    {!entry.description ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        No description yet
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${entry.title}`}
                        onClick={() => setOpenEntryId(entry.id)}
                        disabled={isPending}
                      >
                        <PencilSimpleIcon weight="bold" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${entry.title}`}
                        onClick={() => handleRemove(entry.id)}
                        disabled={isPending}
                      >
                        <TrashIcon weight="bold" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={pendingMutation}
        >
          <PlusIcon weight="bold" />
          {messages.addLabel}
        </Button>
        <CountSummary
          count={items.length}
          recommendedMin={messages.recommendedMin}
          softMax={messages.softMax}
          softWarning={messages.softWarning}
        />
      </div>

      <EntryEditDialog
        key={openEntry?.id}
        characterId={characterId}
        identityVersion={identityVersion}
        entry={openEntry}
        singularLabel={messages.singularLabel}
        titlePlaceholder={messages.titlePlaceholder}
        descriptionPlaceholder={messages.descriptionPlaceholder}
        saveError={messages.saveError}
        updateEntry={updateEntry}
        onClose={() => setOpenEntryId(null)}
      />
    </FieldSet>
  )
}

function CountSummary({
  count,
  recommendedMin,
  softMax,
  softWarning,
}: {
  count: number
  recommendedMin: number
  softMax: number
  softWarning: string
}) {
  if (count > softMax) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-300">
        {count} entries — {softWarning}
      </span>
    )
  }
  if (count < recommendedMin) {
    return (
      <span className="text-xs text-muted-foreground">
        {count}/{recommendedMin} minimum
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">{count} entries</span>
}

/**
 * Edit dialog mounted at the FieldSet level so a row remount on the table
 * (cross-tab broadcast, prop sync) doesn't kill the in-flight editor. The
 * `key` on the dialog itself is the open entry's id so the
 * `useDebouncedAutoSave` hooks inside re-initialize when the player opens
 * a different row.
 *
 * The dialog overrides shadcn's default `sm:max-w-sm` to take up most of
 * the viewport — narrative writing wants room to breathe. UNN-211 replaces
 * this with a dedicated full-width writer view.
 */
function EntryEditDialog({
  characterId,
  identityVersion,
  entry,
  singularLabel,
  titlePlaceholder,
  descriptionPlaceholder,
  saveError,
  updateEntry,
  onClose,
}: {
  characterId: string
  identityVersion: number
  entry: EntryRow | null
  singularLabel: string
  titlePlaceholder: string
  descriptionPlaceholder: string
  saveError: string
  updateEntry: (
    entryId: string,
    title: string,
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<EntryActionResult, string>>
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
            updateEntry={updateEntry}
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
  updateEntry,
}: {
  characterId: string
  identityVersion: number
  entry: EntryRow
  titlePlaceholder: string
  descriptionPlaceholder: string
  saveError: string
  updateEntry: (
    entryId: string,
    title: string,
    description: string | null,
    expectedVersion: number
  ) => Promise<Result<EntryActionResult, string>>
}) {
  const title = useDebouncedAutoSave({
    serverValue: entry.title,
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    isEmpty: (v) => v.trim().length === 0,
    onError: () => toast.error(saveError),
    save: async (next, expectedVersion) => {
      const result = await updateEntry(
        entry.id,
        next.trim(),
        entry.description,
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

  const description = useDebouncedAutoSave({
    serverValue: entry.description ?? "",
    serverVersion: identityVersion,
    characterId,
    characterClass: "identity",
    isEqual: (a, b) => a.trim() === b.trim(),
    onError: () => toast.error(saveError),
    save: async (next, expectedVersion) => {
      const normalized = next.trim().length === 0 ? null : next
      const result = await updateEntry(
        entry.id,
        entry.title,
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
