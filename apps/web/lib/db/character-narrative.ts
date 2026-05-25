import { and, eq, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters } from "./schema/character"

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

  const updated = await db
    .update(characters)
    .set({
      ...patch,
      identityVersion: sql`${characters.identityVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.identityVersion, expectedVersion)
      )
    )
    .returning({ identityVersion: characters.identityVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({ version: updated[0]!.identityVersion })
}
