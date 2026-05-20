import { eq } from "drizzle-orm"
import { err, ok, type Result } from "../game/result"
import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type PartialRestInput,
  type RespiteInput,
  type RestError,
  type RestingCharacter,
} from "../game/rest"
import { db } from "./index"
import {
  loadHydratedCharacterById,
  toStatComputationCharacter,
} from "./load-character"
import { characters } from "./schema"
import { HydratedCharacter } from "../game/hydrated-character"

/**
 * Persistence for the pure rest engine: hydrate the character via
 * {@link loadHydratedCharacterById} (max HP/SP are derived from its view),
 * project it onto the engine's {@link RestingCharacter} input, run the pure
 * transition, and on success write back only the pool columns that rest
 * changes. Each write is a single-row `UPDATE`, so `neon-http`'s lack of
 * interactive transactions is irrelevant.
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
 * The pure engine's failures plus the one this layer adds: the id matched no
 * character. Kept off {@link RestError} because a missing row is a persistence
 * concern the pure engine never encounters.
 */
export type RestPersistenceError = RestError | "character-not-found"

/**
 * Resolves a Full Rest and persists the restored HP/SP, refilled Hit/Skill
 * Dice, decremented Exhaustion, and refilled Prisma charges in one single-row
 * update. A Full Rest cannot fail, so the only error is `character-not-found`.
 */
export async function applyFullRestForCharacter(
  characterId: string
): Promise<Result<RestingCharacter, "character-not-found">> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const updated = applyFullRest(toRestingCharacter(character))

  await db
    .update(characters)
    .set({
      currentHP: updated.currentHP,
      currentSP: updated.currentSP,
      hitDiceRemaining: updated.hitDiceRemaining,
      skillDiceRemaining: updated.skillDiceRemaining,
      exhaustion: updated.exhaustion,
      prismaCharges: updated.prismaCharges,
    })
    .where(eq(characters.id, characterId))

  return ok(updated)
}

/**
 * Resolves a Partial Rest and persists the restored HP, deducted Skill Dice,
 * and recovered SP. Returns the engine's failure result unwritten when the
 * spend exceeds the unspent Skill Dice, or `character-not-found` when the id
 * matches no character.
 */
export async function applyPartialRestForCharacter(
  characterId: string,
  input: PartialRestInput
): Promise<Result<RestingCharacter, RestPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyPartialRest(toRestingCharacter(character), input)
  if (!result.ok) return result

  await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      currentSP: result.value.currentSP,
      skillDiceRemaining: result.value.skillDiceRemaining,
    })
    .where(eq(characters.id, characterId))

  return result
}

/**
 * Resolves a Respite and persists the recovered HP and deducted Hit Dice.
 * Returns the engine's failure result unwritten when the spend exceeds the
 * unspent Hit Dice, or `character-not-found` when the id matches no character.
 */
export async function applyRespiteForCharacter(
  characterId: string,
  input: RespiteInput
): Promise<Result<RestingCharacter, RestPersistenceError>> {
  const character = await loadHydratedCharacterById(characterId)
  if (!character) return err("character-not-found")

  const result = applyRespite(toRestingCharacter(character), input)
  if (!result.ok) return result

  await db
    .update(characters)
    .set({
      currentHP: result.value.currentHP,
      hitDiceRemaining: result.value.hitDiceRemaining,
    })
    .where(eq(characters.id, characterId))

  return result
}
