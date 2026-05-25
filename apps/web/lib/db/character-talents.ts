import { and, eq, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { TALENT_KEYS, type TalentKey } from "../game/talents"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters } from "./schema/character"

/**
 * Persistence for the Step-3 / sheet Talents picker. The `gainedTalents`
 * JSONB column holds the keys of player-acquired Talents — Background picks
 * at character creation (capped at 2 per PRD §5.2) and later downtime
 * picks (rulebook 2.1). Active-Archetype Talents are *derived* by
 * `resolveTalents` at hydration and never written to this column, so a
 * key listed here is always a deliberate addition.
 *
 * Reads + writes are wrapped in a transaction with the identity-class
 * version bump first; the row lock either blocks a concurrent identity-class
 * writer or our `expectedVersion` WHERE clause misses cleanly with no JSONB
 * touched. Same shape as `inventory.ts`'s child-table pattern.
 */

export type CharacterTalentPersistenceError =
  | "character-not-found"
  | "stale"
  | "unknown-talent"
  | "duplicate-talent"
  | "talent-not-found"
  | "limit-exceeded"

export interface CharacterTalentPersistenceSuccess {
  version: number
  gainedTalents: TalentKey[]
}

/**
 * Max player-added Talents at character creation, per PRD §5.2. The hardcoded
 * archetype Talents that resolve at hydration are *additive* on top of this
 * cap — the limit applies only to entries the player explicitly picked.
 */
export const MAX_PLAYER_ADDED_TALENTS = 2

const TALENT_KEY_SET = new Set<string>(TALENT_KEYS)

export async function addGainedTalent(
  characterId: string,
  talentKey: string,
  expectedVersion: number
): Promise<
  Result<CharacterTalentPersistenceSuccess, CharacterTalentPersistenceError>
> {
  if (!TALENT_KEY_SET.has(talentKey)) return err("unknown-talent")

  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
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

    const [row] = await tx
      .select({ gainedTalents: characters.gainedTalents })
      .from(characters)
      .where(eq(characters.id, characterId))

    const current = row?.gainedTalents ?? []
    if (current.includes(talentKey as TalentKey)) return err("duplicate-talent")
    if (current.length >= MAX_PLAYER_ADDED_TALENTS) return err("limit-exceeded")

    const next = [...current, talentKey as TalentKey]

    await tx
      .update(characters)
      .set({ gainedTalents: next })
      .where(eq(characters.id, characterId))

    return ok({ version: bumped.identityVersion, gainedTalents: next })
  })
}

export async function removeGainedTalent(
  characterId: string,
  talentKey: string,
  expectedVersion: number
): Promise<
  Result<CharacterTalentPersistenceSuccess, CharacterTalentPersistenceError>
> {
  if (!TALENT_KEY_SET.has(talentKey)) return err("unknown-talent")

  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
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

    const [row] = await tx
      .select({ gainedTalents: characters.gainedTalents })
      .from(characters)
      .where(eq(characters.id, characterId))

    const current = row?.gainedTalents ?? []
    if (!current.includes(talentKey as TalentKey))
      return err("talent-not-found")

    const next = current.filter((key) => key !== talentKey)

    await tx
      .update(characters)
      .set({ gainedTalents: next })
      .where(eq(characters.id, characterId))

    return ok({ version: bumped.identityVersion, gainedTalents: next })
  })
}
