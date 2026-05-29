import { eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { TALENT_KEYS, type TalentKey } from "@/lib/game/character"
import { err, ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the Step-3 / sheet Talents picker. The `gainedTalents`
 * JSONB column holds the keys of player-acquired Talents — Background picks
 * at character creation and post-creation additions from the Explore tab.
 * Active-Archetype Talents are *derived* by `resolveTalents` at hydration
 * and never written to this column, so a key listed here is always a
 * deliberate addition. The Background slot count (PRD §5.2) lives as a
 * builder-UI gate in `talents-picker.tsx`; this layer enforces only
 * structural validity (known key, no duplicates).
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

export interface CharacterTalentPersistenceSuccess {
  version: number
  gainedTalents: TalentKey[]
}

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
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      "identity",
      expectedVersion
    )
    if (!bumped.ok) return bumped

    const [row] = await tx
      .select({ gainedTalents: characters.gainedTalents })
      .from(characters)
      .where(eq(characters.id, characterId))

    const current = row?.gainedTalents ?? []
    if (current.includes(talentKey as TalentKey)) return err("duplicate-talent")

    const next = [...current, talentKey as TalentKey]

    await tx
      .update(characters)
      .set({ gainedTalents: next })
      .where(eq(characters.id, characterId))

    return ok({ version: bumped.value.version, gainedTalents: next })
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
    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      "identity",
      expectedVersion
    )
    if (!bumped.ok) return bumped

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

    return ok({ version: bumped.value.version, gainedTalents: next })
  })
}
