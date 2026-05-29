import {
  toStatComputationCharacter,
  type HydratedCharacter,
} from "../game/character"
import {
  applyCast,
  type CastError,
  type CastingCharacter,
} from "../game/skills"
import { err, ok, type Result } from "../result"
import { db } from "./index"
import { loadHydratedCharacterById } from "./load-character"
import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the pure cast engine (PRD §7.2): hydrate the character via
 * {@link loadHydratedCharacterById} (max HP/SP and the active Skill set are
 * derived from its view), find the Skill the caller named in the hydrated
 * Skill list, project the character onto the engine's {@link CastingCharacter}
 * input, run the pure {@link applyCast} transition, then write back the
 * deducted pool via a single-row `UPDATE` conditioned on
 * `(id, vitalsVersion)` — Cast is a vitals-class write per the UNN-140
 * per-write-class baseline, identical to rest. A concurrent vitals-class
 * write surfaces `"stale"`; an independent identity / inventory / progression
 * edit bumps a different column and does not race.
 */

function toCastingCharacter(character: HydratedCharacter): CastingCharacter {
  return {
    ...toStatComputationCharacter(character),
    currentHP: character.currentHP,
    currentSP: character.currentSP,
  }
}

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces: the id matched no character, the caller named a Skill the
 * character does not currently have access to, or the row's `vitalsVersion`
 * no longer equals the caller's `expectedVersion`. `skill-not-found` is
 * defensive — the UI only renders Cast for Skills already in the hydrated
 * list — but the database still treats the wire as untrusted.
 */
export type CastPersistenceError =
  | CastError
  | "skill-not-found"
  | "character-not-found"
  | "stale"

export interface CastPersistenceSuccess {
  currentHP: number
  currentSP: number
  version: number
}

/**
 * Resolves a Skill cast and persists the deducted HP or SP. Returns the
 * engine's failure result unwritten when the character cannot pay the cost,
 * `skill-not-found` when the Skill key isn't part of the character's active
 * Skill set (granted by the active Archetype's Ranks, Inheritance Slots, or
 * equipped item), `character-not-found` when the id matches no character, or
 * `"stale"` when a concurrent vitals-class write bumped `vitalsVersion` past
 * `expectedVersion`.
 */
export async function applyCastForCharacter(
  characterId: string,
  skillKey: string,
  expectedVersion: number
): Promise<Result<CastPersistenceSuccess, CastPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const skill = character.skills.find((entry) => entry.key === skillKey)
  if (!skill) return err("skill-not-found")

  const result = applyCast(skill, toCastingCharacter(character))
  if (!result.ok) return result

  const bumped = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "vitals",
    expectedVersion,
    {
      currentHP: result.value.currentHP,
      currentSP: result.value.currentSP,
    }
  )
  if (!bumped.ok) return bumped

  return ok({
    currentHP: result.value.currentHP,
    currentSP: result.value.currentSP,
    version: bumped.value.version,
  })
}
