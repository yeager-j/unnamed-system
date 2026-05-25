import { and, eq, sql } from "drizzle-orm"

import { getArchetype } from "../game/archetypes"
import { err, ok, type Result } from "../game/result"
import type { TalentKey } from "../game/talents"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characterArchetypes, characters } from "./schema/character"

/**
 * Persistence for the builder's Origin Archetype choice (PRD §5.1).
 *
 * Inserts a fresh `characterArchetype` row with `rank: 2` for the picked
 * Archetype and points `characters.activeArchetypeId` at it. When the player
 * switches Origin on Step 2, the prior `characterArchetype` row is discarded
 * first — a draft only ever has one Archetype row in play, so a clean
 * delete-and-replace keeps the row set tidy without touching foreign keys
 * elsewhere (inheritance slot fills, mechanic state) that don't yet exist.
 *
 * Concurrency: the parent UPDATE bumps `identityVersion` conditionally
 * **first** inside a transaction (matches the child-write pattern in
 * `lib/db/inventory.ts`) so a concurrent identity-class writer either blocks
 * on the row lock or causes our WHERE to miss with no child rows touched.
 */

export type OriginArchetypePersistenceError = "character-not-found" | "stale"

export interface OriginArchetypePersistenceSuccess {
  /** Surrogate id of the newly-inserted `characterArchetype` row. */
  activeArchetypeId: string
  /** The picked Archetype's catalog key, echoed for the client's optimistic frame. */
  archetypeKey: string
  /** The bumped `identityVersion`. */
  version: number
}

export async function setOriginArchetype(
  characterId: string,
  archetypeKey: string,
  expectedVersion: number
): Promise<
  Result<OriginArchetypePersistenceSuccess, OriginArchetypePersistenceError>
> {
  return db.transaction(async (tx) => {
    // 1. Bump the version (and clear activeArchetypeId so the FK won't fail
    //    when we delete the row it currently points at).
    const [bumped] = await tx
      .update(characters)
      .set({
        activeArchetypeId: null,
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

    if (!bumped) {
      return (await characterExists(characterId))
        ? err("stale")
        : err("character-not-found")
    }

    // 2. Clear any existing characterArchetype rows for this character.
    //    During Step 2 of the builder this is at most one row; a second
    //    "switch Origin" click is the only path that actually deletes
    //    something here.
    await tx
      .delete(characterArchetypes)
      .where(eq(characterArchetypes.characterId, characterId))

    // 3. Insert the picked Archetype as Rank 2 (PRD §5.1 — Origin auto-sets
    //    Rank to 2 at finalization, unlocking Skills 1 & 2).
    const [inserted] = await tx
      .insert(characterArchetypes)
      .values({
        characterId,
        archetypeKey,
        rank: 2,
      })
      .returning({ id: characterArchetypes.id })

    // 4. Drop any player-added Talents the new Origin now grants. A Talent
    //    granted by the active Archetype is resolved at hydration; keeping
    //    it in `gainedTalents` would (a) over-count against the §5.2 cap
    //    (`MAX_PLAYER_ADDED_TALENTS`), and (b) leave the picker's "Background
    //    Talents N/MAX" counter out of step with the visible chips, which
    //    already filter out Origin-granted keys. Same transaction as the
    //    identity bump, so a concurrent `addGainedTalent` either sees the
    //    pruned column or fails the stale check.
    const newOriginTalents = getArchetype(archetypeKey)?.talents ?? []
    if (newOriginTalents.length > 0) {
      const [row] = await tx
        .select({ gainedTalents: characters.gainedTalents })
        .from(characters)
        .where(eq(characters.id, characterId))

      const current = row?.gainedTalents ?? []
      const originSet = new Set<TalentKey>(newOriginTalents)
      const pruned = current.filter((key) => !originSet.has(key))
      if (pruned.length !== current.length) {
        await tx
          .update(characters)
          .set({ gainedTalents: pruned })
          .where(eq(characters.id, characterId))
      }
    }

    // 5. Point the character at the new row.
    await tx
      .update(characters)
      .set({ activeArchetypeId: inserted!.id })
      .where(eq(characters.id, characterId))

    return ok({
      activeArchetypeId: inserted!.id,
      archetypeKey,
      version: bumped.identityVersion,
    })
  })
}
