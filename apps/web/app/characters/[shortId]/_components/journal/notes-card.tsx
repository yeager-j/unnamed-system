"use client"

import { Prose } from "@/components/shared/prose"
import { useLoadedCharacter } from "@/domain/entity/use-entity-write"

import { SheetCard } from "../sheet-card"

/**
 * The Notes card: the free-form `profile.notes` app column, read-only and
 * visible to every viewer (notes are table-facing, unlike Secrets).
 */
export function NotesCard() {
  const { profile } = useLoadedCharacter()

  return (
    <SheetCard title="Notes">
      {profile.notes ? (
        <Prose>{profile.notes}</Prose>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </SheetCard>
  )
}
