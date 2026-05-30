import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { characterArchetypes } from "@/lib/db/schema/character"
import { err, ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for switching which unlocked Archetype is active (PRD §6.1,
 * UNN-238). Re-points `characters.activeArchetypeId` at an existing
 * `characterArchetype` row; the Mechanics Engine re-derives Attributes,
 * Affinities, Skills, the Mechanic widget, and Inheritance-Slot effects from
 * that single field on the next load, so this is a one-field pointer write — no
 * row creation, no denormalized state to migrate (each Archetype's mechanic
 * state lives on its own `characterArchetype` row and is preserved).
 *
 * `setOriginArchetype` is the only other writer of this column and bumps the
 * `identityVersion` class; this wrapper matches it so the two never falsely
 * conflict against an unrelated vitals/inventory/progression write.
 *
 * The FK guarantees the target id references *some* `characterArchetype`, but
 * not that it belongs to *this* character, so the transaction verifies
 * ownership before the guarded bump — defense in depth against a request that
 * points at another character's row.
 */

export type ActiveArchetypePersistenceError =
  | "character-not-found"
  | "stale"
  | "archetype-not-owned"

export interface ActiveArchetypePersistenceSuccess {
  /** The now-active `characterArchetype` row id, echoed for the optimistic frame. */
  activeArchetypeId: string
  /** The bumped `identityVersion`. */
  version: number
}

/**
 * Points the character at `characterArchetypeId` as its active Archetype, but
 * only if that row belongs to the character and the row's current
 * `identityVersion` still matches `expectedVersion`.
 */
export async function setActiveArchetype(
  characterId: string,
  characterArchetypeId: string,
  expectedVersion: number
): Promise<
  Result<ActiveArchetypePersistenceSuccess, ActiveArchetypePersistenceError>
> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ characterId: characterArchetypes.characterId })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.id, characterArchetypeId))
    if (!target || target.characterId !== characterId) {
      return err("archetype-not-owned")
    }

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      "identity",
      expectedVersion,
      { activeArchetypeId: characterArchetypeId }
    )
    if (!bumped.ok) return bumped

    return ok({
      activeArchetypeId: characterArchetypeId,
      version: bumped.value.version,
    })
  })
}
