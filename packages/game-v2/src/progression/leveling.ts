import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import {
  computeMaxHitDice,
  computeMaxSkillDice,
} from "@workspace/game-v2/resources/derive"

/**
 * Level-up resolution, re-homed from v1 (`engine/character/leveling.ts`):
 * spending 7 Victories for a level, 2 saveable Archetype Ranks, and a refreshed
 * Hit/Skill Dice pool. Pure — returns a fresh character, never mutates. Max HP/SP
 * is *not* touched here; it derives from `level` (so bumping level is enough).
 *
 * Spark-log / Virtue rank-up (also v1's leveling.ts) is a separate progression
 * concern (a write reducer) and lands with the progression-writes PR.
 */

/** Victories needed per level and the hard level ceiling (rulebook 1.1, 1.6). */
export const VICTORIES_PER_LEVEL = 7
export const MAX_LEVEL = 30

/** Saveable Archetype Ranks granted by one level-up (rulebook 1.6). */
export const ARCHETYPE_RANKS_PER_LEVEL = 2

/** The character state level-up resolution reads and rewrites. */
export interface LevelingCharacter {
  level: number
  victories: number
  savedArchetypeRanks: number
  hitDiceRemaining: number
  skillDiceRemaining: number
}

/** Expected, recoverable failures (not programmer errors). */
export type LevelingError = "insufficient-victories" | "max-level"

/**
 * Whether the character may level up now: ≥ {@link VICTORIES_PER_LEVEL} Victories
 * banked and below {@link MAX_LEVEL}.
 */
export function canLevelUp(character: LevelingCharacter): boolean {
  return (
    character.victories >= VICTORIES_PER_LEVEL && character.level < MAX_LEVEL
  )
}

/**
 * Spends {@link VICTORIES_PER_LEVEL} Victories: +1 level, +2 saved ranks, dice
 * pools refilled to the new level's totals. Victory overflow carries forward.
 * Fails — without mutating — at {@link MAX_LEVEL} (`max-level`, checked first) or
 * with too few Victories (`insufficient-victories`).
 */
export function applyLevelUp(
  character: LevelingCharacter
): Result<LevelingCharacter, LevelingError> {
  if (character.level >= MAX_LEVEL) return err("max-level")
  if (character.victories < VICTORIES_PER_LEVEL) {
    return err("insufficient-victories")
  }

  const level = character.level + 1

  return ok({
    ...character,
    level,
    victories: character.victories - VICTORIES_PER_LEVEL,
    savedArchetypeRanks:
      character.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL,
    hitDiceRemaining: computeMaxHitDice(level),
    skillDiceRemaining: computeMaxSkillDice(level),
  })
}
