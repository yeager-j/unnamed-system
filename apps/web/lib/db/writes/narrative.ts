import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the three Step-3 narrative free-text columns: `ancestryText`,
 * `backgroundText`, `backstoryText`. Each is identity-class — bumps
 * `identityVersion` and conditions on `expectedVersion` exactly like
 * `character-name`. Empty / whitespace strings normalize to `null` so the
 * column stays a clean "set vs. unset" rather than mixing empty strings
 * with nulls downstream.
 */

export type CharacterNarrativePersistenceError = "character-not-found" | "stale"

export interface CharacterNarrativePersistenceSuccess {
  version: number
}

export type NarrativeField = "ancestry" | "background" | "backstory"

const COLUMN_FOR_FIELD = {
  ancestry: "ancestryText",
  background: "backgroundText",
  backstory: "backstoryText",
} as const satisfies Record<
  NarrativeField,
  keyof typeof characters.$inferInsert
>

export async function updateCharacterNarrative(
  characterId: string,
  field: NarrativeField,
  text: string,
  expectedVersion: number
): Promise<
  Result<
    CharacterNarrativePersistenceSuccess,
    CharacterNarrativePersistenceError
  >
> {
  const normalized = text.trim().length === 0 ? null : text
  const patch = { [COLUMN_FOR_FIELD[field]]: normalized } as Partial<
    typeof characters.$inferInsert
  >

  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "identity",
    expectedVersion,
    patch
  )
  if (!result.ok) return result

  return ok({ version: result.value.version })
}
