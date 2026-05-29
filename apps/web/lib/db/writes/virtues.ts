import { db } from "@/lib/db/client"
import type { VirtueAllocation } from "@/lib/game/character"
import { ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

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
  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "identity",
    expectedVersion,
    {
      virtueExpression: allocation.expression,
      virtueEmpathy: allocation.empathy,
      virtueWisdom: allocation.wisdom,
      virtueFocus: allocation.focus,
    }
  )
  if (!result.ok) return result

  return ok({ version: result.value.version })
}
