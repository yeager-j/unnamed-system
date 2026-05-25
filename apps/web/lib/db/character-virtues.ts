import { and, eq, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import type { VirtueAllocation } from "../game/virtues/allocation"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters } from "./schema/character"

/**
 * Persistence for the character creation Virtue allocation (rulebook 1.2):
 * one Virtue at Rank 2, two distinct Virtues at Rank 1, the fourth at
 * Rank 0. The wrapper writes the full 4-virtue map in one identity-class
 * UPDATE so a partial allocation can never reach the row — the gate logic
 * upstream enforces validity, this layer just persists what passed it.
 */

export type CharacterVirtuesPersistenceError = "character-not-found" | "stale"

export interface CharacterVirtuesPersistenceSuccess {
  version: number
}

export async function setCharacterVirtues(
  characterId: string,
  allocation: VirtueAllocation,
  expectedVersion: number
): Promise<
  Result<CharacterVirtuesPersistenceSuccess, CharacterVirtuesPersistenceError>
> {
  const updated = await db
    .update(characters)
    .set({
      virtueExpression: allocation.expression,
      virtueEmpathy: allocation.empathy,
      virtueWisdom: allocation.wisdom,
      virtueFocus: allocation.focus,
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
