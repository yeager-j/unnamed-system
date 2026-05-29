import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import { characters } from "@/lib/db/schema/character"
import {
  applyLevelUp,
  type LevelingCharacter,
  type LevelingError,
} from "@/lib/game/character"
import { err, ok, type Result } from "@/lib/result"

import {
  bumpCharacterVersionGuarded,
  characterVersionIncrement,
  staleOrMissing,
} from "./version-guard"

/**
 * Persistence for the pure leveling engine: load the row, run the (pure)
 * transition, then write back with a single-row `UPDATE` conditioned on the
 * relevant per-write-class versions (UNN-140). Awarding Victories is a
 * trivial counter bump with no engine counterpart and lives here directly.
 *
 * `awardVictoriesForCharacter` is progression-class only. `applyLevelUp`
 * straddles two classes — it touches `victories`/`savedArchetypeRanks`
 * (progression) AND `hitDiceRemaining`/`skillDiceRemaining` (vitals) — so it
 * conditions on both expected versions and bumps both. Level-up is rare and
 * structurally a large mutation that should coordinate with both surfaces.
 */

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces: the id matched no character, or one of the row's versions no
 * longer equals the caller's expected token because a concurrent same-class
 * write landed first.
 */
export type LevelingPersistenceError =
  | LevelingError
  | "character-not-found"
  | "stale"

export interface AwardVictoriesPersistenceSuccess {
  character: LevelingCharacter
  version: number
}

export interface LevelUpPersistenceSuccess {
  character: LevelingCharacter
  versions: { progression: number; vitals: number }
}

/**
 * Expected per-write-class version tokens for the joint progression + vitals
 * write that level-up performs.
 */
export interface LevelUpExpectedVersions {
  progression: number
  vitals: number
}

async function loadLevelingCharacter(
  characterId: string
): Promise<LevelingCharacter | null> {
  const row = await loadCharacterRowById(characterId)
  if (!row) return null

  const {
    level,
    victories,
    savedArchetypeRanks,
    hitDiceRemaining,
    skillDiceRemaining,
  } = row
  return {
    level,
    victories,
    savedArchetypeRanks,
    hitDiceRemaining,
    skillDiceRemaining,
  }
}

/**
 * Adds `amount` Victories (1 for a standard Victory, 2 for a Heroic Victory —
 * Heroic accounting is the caller's concern) and persists the new total.
 * Returns `character-not-found` when the id matches no character, or
 * `"stale"` when a concurrent progression-class write bumped
 * `progressionVersion` past `expectedVersion`.
 */
export async function awardVictoriesForCharacter(
  characterId: string,
  amount: number,
  expectedVersion: number
): Promise<Result<AwardVictoriesPersistenceSuccess, LevelingPersistenceError>> {
  const character = await loadLevelingCharacter(characterId)
  if (!character) return err("character-not-found")

  const next = {
    ...character,
    victories: character.victories + amount,
  }

  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "progression",
    expectedVersion,
    { victories: next.victories }
  )
  if (!bumped.ok) return bumped

  return ok({ character: next, version: bumped.value.version })
}

/**
 * Resolves a level-up and persists the new level, carried-over Victories,
 * accumulated saved Archetype Ranks, and refilled Hit/Skill Dice pools in one
 * single-row update. Conditions on both `progressionVersion` and
 * `vitalsVersion` and bumps both — see the file header for the rationale.
 * Returns the engine's failure result unwritten on any validation failure,
 * `character-not-found` when the id matches no character, or `"stale"` when
 * either expected version no longer matches.
 */
export async function applyLevelUpForCharacter(
  characterId: string,
  expectedVersions: LevelUpExpectedVersions
): Promise<Result<LevelUpPersistenceSuccess, LevelingPersistenceError>> {
  const character = await loadLevelingCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = applyLevelUp(character)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      level: result.value.level,
      victories: result.value.victories,
      savedArchetypeRanks: result.value.savedArchetypeRanks,
      hitDiceRemaining: result.value.hitDiceRemaining,
      skillDiceRemaining: result.value.skillDiceRemaining,
      ...characterVersionIncrement("progression"),
      ...characterVersionIncrement("vitals"),
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.progressionVersion, expectedVersions.progression),
        eq(characters.vitalsVersion, expectedVersions.vitals)
      )
    )
    .returning({
      progressionVersion: characters.progressionVersion,
      vitalsVersion: characters.vitalsVersion,
    })

  if (updated.length === 0) return staleOrMissing(db, characterId)

  return ok({
    character: result.value,
    versions: {
      progression: updated[0]!.progressionVersion,
      vitals: updated[0]!.vitalsVersion,
    },
  })
}
