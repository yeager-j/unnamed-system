import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characters } from "./schema/character"

/**
 * Persistence for the trivial character-name update (no engine transition).
 * Implements the baseline optimistic-concurrency shape every UNN-180 write
 * wrapper follows: the UPDATE matches on `(id, updatedAt)` and returns the
 * fresh row, so a stale `expectedUpdatedAt` produces zero rows and we surface
 * `"stale"` rather than silently overwriting a concurrent edit. UNN-140 may
 * later replace this strategy across all wrappers; the consumer contract
 * (`stale` as a recoverable error) is the seam that lets it.
 */

/**
 * The failure cases this layer surfaces: the id matched no character, or the
 * row's `updatedAt` no longer equals the caller's `expectedUpdatedAt` because
 * a concurrent write landed first.
 */
export type CharacterNamePersistenceError = "character-not-found" | "stale"

/**
 * Updates `name` on the character with `characterId`, but only if the row's
 * current `updatedAt` matches `expectedUpdatedAt`. Returns the fresh `name`
 * and `updatedAt` on success so the client can chain subsequent saves without
 * a re-fetch.
 */
export async function updateCharacterName(
  characterId: string,
  name: string,
  expectedUpdatedAt: Date
): Promise<
  Result<{ name: string; updatedAt: Date }, CharacterNamePersistenceError>
> {
  const updated = await db
    .update(characters)
    .set({ name })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.updatedAt, expectedUpdatedAt)
      )
    )
    .returning({ name: characters.name, updatedAt: characters.updatedAt })

  if (updated.length === 0) {
    const stillExists = await db
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, characterId))
      .limit(1)

    return stillExists.length === 0 ? err("character-not-found") : err("stale")
  }

  const [row] = updated
  return ok({ name: row!.name, updatedAt: row!.updatedAt })
}
