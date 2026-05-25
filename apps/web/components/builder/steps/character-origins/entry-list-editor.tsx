"use client"

import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import type { Result } from "@/lib/game/result"

import { EntryEditDialog } from "./entry-edit-dialog"

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
  /** Singular noun used in the dialog header (e.g. "Knife"). */
  singularLabel: string
  /** Per-entry title placeholder shown when the title is empty. */
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
  /** Soft-warn copy when count > softMax. */
  softWarning: string
  softMax: number
  /** Lower-bound informational nudge; never blocks. */
  recommendedMin: number
  /** Toast copy on save failure. */
  saveError: string
}

export interface EntryMutationResult {
  /** New identity version after the bump. */
  version: number
}

export interface EntryAddResult extends EntryMutationResult {
  id: string
}

export interface EntryActions {
  add: (
    title: string,
    expectedVersion: number
  ) => Promise<Result<EntryAddResult, string>>
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
  remove: (
    entryId: string,
    expectedVersion: number
  ) => Promise<Result<EntryMutationResult, string>>
}

/**
 * Table-driven editor for the Step-3 Knives + Chains lists. Each entry is a
 * single row showing the title and row actions — the editor pulls the
 * Markdown description into a Dialog (UNN-207 chose this shape to scale
 * cleanly past a handful of entries; a follow-up — UNN-211 — replaces the
 * Dialog with a dedicated full-width writer view).
 *
 * Adds are deliberately *not* optimistic: we wait for the server to assign
 * the real id, then append the row and open the edit dialog. Earlier
 * versions added a temp row + opened the dialog immediately, then swapped
 * the temp id for the real one on success — which made the dialog re-key
 * mid-flight (visible flicker) and dropped any input the player typed in
 * the first ~500ms. The sub-second pause before the dialog opens is a
 * better trade than that glitch.
 *
 * Remove is still optimistic with snapshot-rollback on failure.
 */
export function EntryListEditor({
  characterId,
  identityVersion,
  initialEntries,
  messages,
  actions,
}: {
  characterId: string
  identityVersion: number
  initialEntries: EntryRow[]
  messages: EntryListMessages
  actions: EntryActions
}) {
  const versionRef = useCharacterTokenRef(identityVersion)
  const [items, setItems] = useState(initialEntries)
  const [syncedFrom, setSyncedFrom] = useState(initialEntries)
  const [pendingMutation, startTransition] = useTransition()
  const [openEntryId, setOpenEntryId] = useState<string | null>(null)

  if (initialEntries !== syncedFrom && !pendingMutation) {
    setSyncedFrom(initialEntries)
    setItems(initialEntries)
  }

  function handleAdd() {
    startTransition(async () => {
      // No optimistic temp row here — we defer both the new row and the
      // edit dialog until the server has assigned a real id. The
      // alternative (optimistic temp id → swap to real id on success)
      // makes the row appear instantly, but it forces the dialog to
      // re-key mid-open, which both visibly flickers and races any input
      // the player types in the first ~500ms. The cost of waiting for
      // the round-trip is a sub-second pause before the dialog opens;
      // the cost of *not* waiting is a UX glitch the player can see.
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          actions.add(messages.newEntryTitle, expectedVersion),
      })
      if (!result.ok) {
        toast.error(messages.saveError)
        return
      }
      const realId = result.value.id
      setItems((prev) => [
        ...prev,
        { id: realId, title: messages.newEntryTitle, description: null },
      ])
      setOpenEntryId(realId)
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
        action: (expectedVersion) => actions.remove(id, expectedVersion),
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
            {items.map((entry) => (
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
                    >
                      <PencilSimpleIcon weight="bold" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${entry.title}`}
                      onClick={() => handleRemove(entry.id)}
                    >
                      <TrashIcon weight="bold" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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

      {/* No `key={openEntry?.id}` — when handleAdd swaps the optimistic
       *  temp id for the server-assigned real id, a key change would
       *  unmount and remount the dialog (visible flicker). The form
       *  already re-mounts on close-and-reopen via the `{entry ? ... }`
       *  conditional inside, so the key wasn't load-bearing for
       *  switching between *different* entries. */}
      <EntryEditDialog
        characterId={characterId}
        identityVersion={identityVersion}
        entry={openEntry}
        singularLabel={messages.singularLabel}
        titlePlaceholder={messages.titlePlaceholder}
        descriptionPlaceholder={messages.descriptionPlaceholder}
        saveError={messages.saveError}
        updateTitle={actions.updateTitle}
        updateDescription={actions.updateDescription}
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
