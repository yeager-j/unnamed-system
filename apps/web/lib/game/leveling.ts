import { err, ok, type Result } from "./result"
import { computeMaxHitDice, computeMaxSkillDice } from "./stats"

/**
 * Level-up resolution: spending 7 Victories to gain a level, 2 saveable
 * Archetype Ranks, and a refreshed Hit/Skill Dice pool (PRD §7.4, rulebook
 * 1.6). Max HP/SP is not touched here — it is derived from `level` by
 * {@link "./stats".computeMaxHP}, so incrementing the level is all that is
 * needed (the MVP uses averaged dice only; rolled HP/SP is out of scope).
 * Pure and side-effect free: every function returns a fresh
 * {@link LevelingCharacter} and never mutates its input; persistence is the
 * thin DB wrapper's job.
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

/**
 * Expected, recoverable failures (not programmer errors): not enough Victories
 * banked, or the character is already at the level ceiling.
 */
export type LevelingError = "insufficient-victories" | "max-level"

/**
 * Whether the character may level up right now: at least
 * {@link VICTORIES_PER_LEVEL} Victories banked and below {@link MAX_LEVEL}.
 */
export function canLevelUp(character: LevelingCharacter): boolean {
  return (
    character.victories >= VICTORIES_PER_LEVEL && character.level < MAX_LEVEL
  )
}

/**
 * Spends {@link VICTORIES_PER_LEVEL} Victories to gain a level: +1 level, +2
 * saved Archetype Ranks, and the Hit/Skill Dice pools refilled to the new
 * level's totals. Victory overflow carries forward (8 banked leaves 1) since,
 * unlike Sparks, Virtues accumulate — a Heroic Victory can push past 7. Fails
 * — without mutating — when the character is already at {@link MAX_LEVEL}
 * (`max-level`) or has fewer than {@link VICTORIES_PER_LEVEL} Victories
 * (`insufficient-victories`).
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
