import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { characterArchetypes, characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"
import {
  getArchetype,
  MASTERY_RANK,
  unmetPrerequisites,
} from "@/lib/game/archetypes"
import { err, ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for spending Saved Archetype Ranks in the Lineage Atlas
 * (UNN-239) — unlocking a new Archetype and ranking up an owned one. Both
 * decrement `characters.savedArchetypeRanks` and mutate the `characterArchetype`
 * roster, so they share this slice and the `progressionVersion` guard (the
 * spent currency is progression — see `lib/db/version-classes.ts`).
 *
 * Saved Ranks are read and decremented **server-side** inside the guarded
 * transaction — never set from a client-supplied total — so back-to-back spends
 * can't lose a decrement (owner-mode write rule). The version guard serializes
 * the read-modify against any concurrent progression write (leveling's grant,
 * another spend): if one slips in, the bump's `WHERE … version = expected`
 * misses and we report `stale` without touching the roster.
 */

export type UnlockArchetypeError =
  | "character-not-found"
  | "stale"
  | "no-ranks"
  | "already-owned"
  | "prerequisites-not-met"
  | "unknown-archetype"

export type RankUpArchetypeError =
  | "character-not-found"
  | "stale"
  | "no-ranks"
  | "archetype-not-owned"
  | "at-max-rank"

export interface UnlockArchetypeSuccess {
  /** Surrogate id of the newly-inserted `characterArchetype` row. */
  characterArchetypeId: string
  /** The unlocked Archetype's catalog key, echoed for the optimistic frame. */
  archetypeKey: string
  /** The bumped `progressionVersion`. */
  version: number
}

export interface RankUpArchetypeSuccess {
  characterArchetypeId: string
  /** The Archetype's new Rank after the increment. */
  rank: number
  /** The bumped `progressionVersion`. */
  version: number
}

/**
 * Unlocks `archetypeKey` for the character: verifies a Saved Rank is available,
 * the Archetype isn't already owned, and its **prerequisites are met** against
 * the character's owned Ranks, then decrements `savedArchetypeRanks` and inserts
 * a fresh `characterArchetype` row at Rank 1. Does not touch the active
 * Archetype pointer — unlocking never switches what's projected.
 *
 * Prerequisites are enforced here, not just in the UI: the Atlas hides locked
 * Archetypes behind a "Prerequisites not met" button, but the rule is a game
 * rule, so the server is the authority (a crafted call can't unlock out of
 * tier). Owned Ranks are read inside the transaction, so the check sees the
 * same snapshot the spend commits against.
 */
export async function unlockArchetype(
  characterId: string,
  archetypeKey: string,
  expectedVersion: number
): Promise<Result<UnlockArchetypeSuccess, UnlockArchetypeError>> {
  const archetype = getArchetype(archetypeKey)
  if (!archetype) return err("unknown-archetype")

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ savedArchetypeRanks: characters.savedArchetypeRanks })
      .from(characters)
      .where(eq(characters.id, characterId))
    if (!row) return err("character-not-found")
    if (row.savedArchetypeRanks <= 0) return err("no-ranks")

    const ownedRows = await tx
      .select({
        archetypeKey: characterArchetypes.archetypeKey,
        rank: characterArchetypes.rank,
      })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, characterId))
    if (ownedRows.some((owned) => owned.archetypeKey === archetypeKey)) {
      return err("already-owned")
    }

    const ownedRankByKey = new Map(
      ownedRows.map((owned) => [owned.archetypeKey, owned.rank] as const)
    )
    if (unmetPrerequisites(archetype, ownedRankByKey).length > 0) {
      return err("prerequisites-not-met")
    }

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.spendArchetypeRank,
      expectedVersion,
      { savedArchetypeRanks: row.savedArchetypeRanks - 1 }
    )
    if (!bumped.ok) return bumped

    const [inserted] = await tx
      .insert(characterArchetypes)
      .values({ characterId, archetypeKey, rank: 1 })
      .returning({ id: characterArchetypes.id })

    return ok({
      characterArchetypeId: inserted!.id,
      archetypeKey,
      version: bumped.value.version,
    })
  })
}

/**
 * Ranks up an owned Archetype by one: verifies the row belongs to the
 * character, isn't already at the Mastery Rank, and a Saved Rank is available,
 * then decrements `savedArchetypeRanks` and increments the row's `rank`.
 *
 * Crossing into {@link MASTERY_RANK} needs no extra write — Mastery is derived
 * from Rank (`hasMasteryBonus`), so the engine applies it automatically on the
 * next load (PRD §7.1).
 */
export async function rankUpArchetype(
  characterId: string,
  characterArchetypeId: string,
  expectedVersion: number
): Promise<Result<RankUpArchetypeSuccess, RankUpArchetypeError>> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        characterId: characterArchetypes.characterId,
        rank: characterArchetypes.rank,
      })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.id, characterArchetypeId))
    if (!target || target.characterId !== characterId) {
      return err("archetype-not-owned")
    }
    if (target.rank >= MASTERY_RANK) return err("at-max-rank")

    const [row] = await tx
      .select({ savedArchetypeRanks: characters.savedArchetypeRanks })
      .from(characters)
      .where(eq(characters.id, characterId))
    if (!row) return err("character-not-found")
    if (row.savedArchetypeRanks <= 0) return err("no-ranks")

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.spendArchetypeRank,
      expectedVersion,
      { savedArchetypeRanks: row.savedArchetypeRanks - 1 }
    )
    if (!bumped.ok) return bumped

    const nextRank = target.rank + 1
    await tx
      .update(characterArchetypes)
      .set({ rank: nextRank })
      .where(eq(characterArchetypes.id, characterArchetypeId))

    return ok({
      characterArchetypeId,
      rank: nextRank,
      version: bumped.value.version,
    })
  })
}
