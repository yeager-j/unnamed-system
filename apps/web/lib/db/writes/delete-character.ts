import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import { characters } from "@/lib/db/schema/character"
import { err, ok, type Result } from "@/lib/result"

/**
 * Persistence for permanent character deletion. A single
 * `DELETE FROM character WHERE id = ?` removes the row; every dependent
 * table (`characterArchetype`, `characterKnife`, `characterChain`,
 * `inventoryItem`, `actionLogEntry`) declares `onDelete: "cascade"` on its
 * `characterId` FK, so Postgres handles the
 * dependent-row cleanup atomically as part of the same statement — no
 * orphans, no manual transaction.
 *
 * Unlike the other UNN-180 write wrappers, this one is **not** gated on
 * `expectedUpdatedAt`. The dialog forces the user to type the character's
 * exact name to enable the destructive button — their intent is
 * unambiguous, and surfacing `"stale"` because a concurrent edit just
 * bumped a field would reject the deletion for a reason the user can't
 * meaningfully act on. The wrapper takes only `characterId`.
 */
export type DeleteCharacterPersistenceError =
  | "character-not-found"
  | "live-encounter-lock"

/**
 * Hard-deletes the character with `characterId`. Refuses with
 * `live-encounter-lock` when the character is a combatant in its campaign's live
 * encounter (UNN-330) — deleting it would strand the DM's mid-fight vitals
 * access. Returns `character-not-found` when no row matches — typically a race
 * with another deleter, since the action's `requireOwner` gate has already
 * loaded the row by the time this runs.
 */
export async function deleteCharacter(
  characterId: string
): Promise<Result<void, DeleteCharacterPersistenceError>> {
  if (await isCharacterLiveEncounterCombatant(characterId)) {
    return err("live-encounter-lock")
  }

  const deleted = await db
    .delete(characters)
    .where(eq(characters.id, characterId))
    .returning({ id: characters.id })

  return deleted.length === 0 ? err("character-not-found") : ok(undefined)
}
