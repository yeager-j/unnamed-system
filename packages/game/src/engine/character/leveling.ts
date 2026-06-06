import {
  computeMaxHitDice,
  computeMaxSkillDice,
} from "@workspace/game/engine/character/stats/stats"
import {
  VIRTUE_KEYS,
  type SparkLog,
  type VirtueKey,
} from "@workspace/game/foundation/character/state"
import { err, ok, type Result } from "@workspace/game/foundation/result"

/**
 * Level-up resolution: spending 7 Victories to gain a level, 2 saveable
 * Archetype Ranks, and a refreshed Hit/Skill Dice pool (PRD §7.4, rulebook
 * 1.6). Max HP/SP is not touched here — it is derived from `level` by
 * {@link "./stats".computeMaxHP}, so incrementing the level is all that is
 * needed (the MVP uses averaged dice only; rolled HP/SP is out of scope).
 * Pure and side-effect free: every function returns a fresh
 * {@link LevelingCharacter} and never mutates its input; persistence is the
 * thin DB wrapper's job.
 *
 * This module also owns Spark log resolution (adding Sparks, computing
 * eligible Virtues, ranking up). Both leveling and Sparks are progression
 * mechanics that consume rewards (Victories / Sparks) to permanently grow
 * the character, so they share a home.
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
 * unlike Sparks, Victories accumulate — a Heroic Victory can push past 7. Fails
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

/** Spark log full / Virtue rank ceiling, both 7 per rulebook 1.2. */
export const SPARK_LOG_CAPACITY = 7
export const MAX_VIRTUE_RANK = 7

/** The character state Spark resolution reads and rewrites. */
export interface SparkCharacter {
  sparkLog: SparkLog
  virtues: Record<VirtueKey, number>
}

/**
 * Expected, recoverable failures (not programmer errors): the log is already
 * full, not yet full, the chosen Virtue is absent from the log, or it is
 * already at the rank ceiling.
 */
export type SparkError =
  | "log-full"
  | "log-not-full"
  | "virtue-not-eligible"
  | "rank-capped"

/**
 * Appends a Spark tagged with `virtue`. Fails with `log-full` once the log
 * holds {@link SPARK_LOG_CAPACITY} Sparks — the player must rank up before
 * earning more.
 */
export function addSpark(
  character: SparkCharacter,
  virtue: VirtueKey
): Result<SparkCharacter, SparkError> {
  if (character.sparkLog.length >= SPARK_LOG_CAPACITY) return err("log-full")

  return ok({
    ...character,
    sparkLog: [...character.sparkLog, virtue],
  })
}

/**
 * The Virtues that may be ranked up right now: those appearing at least once
 * in a full log. An incomplete log makes nothing eligible (rank-up only
 * happens at exactly {@link SPARK_LOG_CAPACITY} Sparks).
 */
export function eligibleVirtuesForRankUp(
  character: SparkCharacter
): Set<VirtueKey> {
  if (character.sparkLog.length < SPARK_LOG_CAPACITY) return new Set()

  return new Set(character.sparkLog)
}

/**
 * Ranks up `virtue` by 1 and clears the log. Fails — without mutating — when
 * the log is not exactly full (`log-not-full`), the Virtue is not in the log
 * (`virtue-not-eligible`), or it is already at {@link MAX_VIRTUE_RANK}
 * (`rank-capped`, leaving the log intact so another eligible Virtue can be
 * chosen instead of wasting the Sparks).
 */
export function rankUpVirtue(
  character: SparkCharacter,
  virtue: VirtueKey
): Result<SparkCharacter, SparkError> {
  if (character.sparkLog.length !== SPARK_LOG_CAPACITY) {
    return err("log-not-full")
  }
  if (!eligibleVirtuesForRankUp(character).has(virtue)) {
    return err("virtue-not-eligible")
  }
  if (character.virtues[virtue] >= MAX_VIRTUE_RANK) return err("rank-capped")

  return ok({
    ...character,
    virtues: { ...character.virtues, [virtue]: character.virtues[virtue] + 1 },
    sparkLog: [],
  })
}

/**
 * The per-Virtue tally of a Spark log, for the sheet's "Wisdom ×2, Empathy ×1"
 * breakdown line. One entry per Virtue that appears at least once, ordered by
 * count descending then {@link VIRTUE_KEYS} order for ties (the stable sort over
 * a `VIRTUE_KEYS`-ordered base preserves that tiebreak). An empty log yields an
 * empty array so the caller can suppress the line entirely.
 */
export function sparkLogBreakdown(
  log: SparkLog
): ReadonlyArray<{ virtue: VirtueKey; count: number }> {
  const counts = new Map<VirtueKey, number>()
  for (const virtue of log) {
    counts.set(virtue, (counts.get(virtue) ?? 0) + 1)
  }

  return VIRTUE_KEYS.filter((virtue) => counts.has(virtue))
    .map((virtue) => ({ virtue, count: counts.get(virtue)! }))
    .sort((a, b) => b.count - a.count)
}
