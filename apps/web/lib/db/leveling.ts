import { eq } from "drizzle-orm"
import {
  applyLevelUp,
  type LevelingCharacter,
  type LevelingError,
} from "../game/leveling"
import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { loadCharacterRowById } from "./load-character"
import { characters } from "./schema"

/**
 * Persistence for the pure leveling engine: load the row, run the (pure)
 * transition, write back only on success. Awarding Victories is a trivial
 * counter bump with no engine counterpart and lives here directly. Each write
 * is a single-row `UPDATE`, so `neon-http`'s lack of interactive transactions
 * is irrelevant.
 */

/**
 * The pure engine's failures plus the one this layer adds: the id matched no
 * character. Kept off {@link LevelingError} because a missing row is a
 * persistence concern the pure engine never encounters.
 */
export type LevelingPersistenceError = LevelingError | "character-not-found"

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
 * Returns `character-not-found` when the id matches no character.
 */
export async function awardVictoriesForCharacter(
  characterId: string,
  amount: number
): Promise<Result<LevelingCharacter, LevelingPersistenceError>> {
  const character = await loadLevelingCharacter(characterId)
  if (!character) return err("character-not-found")

  const updated = {
    ...character,
    victories: character.victories + amount,
  }

  await db
    .update(characters)
    .set({ victories: updated.victories })
    .where(eq(characters.id, characterId))

  return ok(updated)
}

/**
 * Resolves a level-up and persists the new level, carried-over Victories,
 * accumulated saved Archetype Ranks, and refilled Hit/Skill Dice pools in one
 * atomic single-row update. Returns the engine's failure result unwritten on
 * any validation failure, or `character-not-found` when the id matches no
 * character.
 */
export async function applyLevelUpForCharacter(
  characterId: string
): Promise<Result<LevelingCharacter, LevelingPersistenceError>> {
  const character = await loadLevelingCharacter(characterId)
  if (!character) return err("character-not-found")

  const result = applyLevelUp(character)
  if (!result.ok) return result

  await db
    .update(characters)
    .set({
      level: result.value.level,
      victories: result.value.victories,
      savedArchetypeRanks: result.value.savedArchetypeRanks,
      hitDiceRemaining: result.value.hitDiceRemaining,
      skillDiceRemaining: result.value.skillDiceRemaining,
    })
    .where(eq(characters.id, characterId))

  return result
}
