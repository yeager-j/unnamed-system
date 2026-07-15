"use client"

import { Prose } from "@/components/shared/prose"
import {
  CardEditLink,
  useAnimusEditHref,
} from "@/components/shared/sheet-cards/animus-edit"
import { SheetCard } from "@/components/shared/sheet-cards/sheet-card"
import { useLoadedCharacter } from "@/domain/entity/use-entity-write"

/**
 * The Notes card: the free-form `profile.notes` app column, read-only and
 * visible to every viewer (notes are table-facing, unlike Secrets). The owner
 * edits it in the Animus writer via the header affordance (UNN-221).
 */
export function NotesCard() {
  const { profile } = useLoadedCharacter()
  const notesHref = useAnimusEditHref()({
    kind: "notes",
    id: "notes",
    label: "Notes",
  })

  return (
    <SheetCard
      title="Notes"
      headerSlot={
        notesHref ? (
          <CardEditLink href={notesHref} ariaLabel="Edit Notes" />
        ) : undefined
      }
    >
      {profile.notes ? (
        <Prose>{profile.notes}</Prose>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </SheetCard>
  )
}
