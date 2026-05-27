import { and, eq, sql } from "drizzle-orm"

import {
  toStatComputationCharacter,
  type HydratedCharacter,
} from "../game/character"
import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type PartialRestInput,
  type RespiteInput,
  type RestError,
  type RestingCharacter,
} from "../game/combat"
import { err, ok, type Result } from "../result"
import { db } from "./index"
import { characterExists, loadHydratedCharacterById } from "./load-character"
import { characters } from "./schema/character"

/**
 * Persistence for the pure rest engine: hydrate the character via
 * {@link loadHydratedCharacterById} (max HP/SP are derived from its view),
 * project it onto the engine's {@link RestingCharacter} input, run the pure
 * transition, then write back only the pool columns rest changes via a
 * single-row `UPDATE` conditioned on `(id, vitalsVersion)` — all three rest
 * variants are vitals-class writes per the UNN-140 per-write-class baseline.
 * A concurrent vitals-class write surfaces `"stale"`; an independent
 * identity / inventory / progression edit bumps a different column and does
 * not race.
 */

/** Projects a hydrated character onto the pure rest engine's input. */
function toRestingCharacter(character: HydratedCharacter): RestingCharacter {
  return {
    ...toStatComputationCharacter(character),
    currentHP: character.currentHP,
    currentSP: character.currentSP,
    hitDiceRemaining: character.hitDiceRemaining,
    skillDiceRemaining: character.skillDiceRemaining,
    exhaustion: character.exhaustion,
    prismaCharges: character.prismaCharges,
    prismaMaxCharges: character.prismaMaxCharges,
  }
}

/**
 * The pure engine's failures plus the persistence-layer ones this wrapper
 * surfaces: the id matched no character, or the row's `vitalsVersion` no
 * longer equals the caller's `expectedVersion` because a concurrent
 * vitals-class write landed first.
 */
export type RestPersistenceError = RestError | "character-not-found" | "stale"

export interface RestPersistenceSuccess {
  character: RestingCharacter
  version: number
}

/**
 * Resolves a Full Rest and persists the restored HP/SP, refilled Hit/Skill
 * Dice, decremented Exhaustion, and refilled Prisma charges in one single-row
 * update. A Full Rest cannot fail in the engine, so the only errors are
 * `character-not-found` or `"stale"` from the version-token check.
 */
export async function applyFullRestForCharacter(
  characterId: string,
  expectedVersion: number
): Promise<Result<RestPersistenceSuccess, RestPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const next = applyFullRest(toRestingCharacter(character))

  const updated = await db
    .update(characters)
    .set({
      currentHP: next.currentHP,
      currentSP: next.currentSP,
      hitDiceRemaining: next.hitDiceRemaining,
      skillDiceRemaining: next.skillDiceRemaining,
      exhaustion: next.exhaustion,
      prismaCharges: next.prismaCharges,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({ character: next, version: updated[0]!.vitalsVersion })
}

/**
 * Resolves a Partial Rest and persists the restored HP, deducted Skill Dice,
 * and recovered SP. Returns the engine's failure result unwritten when the
 * spend exceeds the unspent Skill Dice, `character-not-found` when the id
 * matches no character, or `"stale"` when a concurrent vitals-class write
 * bumped `vitalsVersion` past `expectedVersion`.
 */
export async function applyPartialRestForCharacter(
  characterId: string,
  input: PartialRestInput,
  expectedVersion: number
): Promise<Result<RestPersistenceSuccess, RestPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyPartialRest(toRestingCharacter(character), input)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      currentSP: result.value.currentSP,
      skillDiceRemaining: result.value.skillDiceRemaining,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({ character: result.value, version: updated[0]!.vitalsVersion })
}

/**
 * Resolves a Respite and persists the recovered HP and deducted Hit Dice.
 * Returns the engine's failure result unwritten when the spend exceeds the
 * unspent Hit Dice, `character-not-found` when the id matches no character,
 * or `"stale"` when a concurrent vitals-class write bumped `vitalsVersion`
 * past `expectedVersion`.
 */
export async function applyRespiteForCharacter(
  characterId: string,
  input: RespiteInput,
  expectedVersion: number
): Promise<Result<RestPersistenceSuccess, RestPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyRespite(toRestingCharacter(character), input)
  if (!result.ok) return result

  const updated = await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      hitDiceRemaining: result.value.hitDiceRemaining,
      vitalsVersion: sql`${characters.vitalsVersion} + 1`,
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.vitalsVersion, expectedVersion)
      )
    )
    .returning({ vitalsVersion: characters.vitalsVersion })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({ character: result.value, version: updated[0]!.vitalsVersion })
}
