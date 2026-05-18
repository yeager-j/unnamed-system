import type { SparkLog, VirtueKey } from "./character"
import { err, ok, type Result } from "./result"

/**
 * Spark log resolution: adding a Spark, computing which Virtues are eligible
 * for rank-up, and resolving a rank-up. The unusual rule (rulebook 1.2; PRD
 * §7.5): at a full log the eligible Virtues are exactly those represented in
 * the log, not all four. Pure and side-effect free — every function returns a
 * fresh {@link SparkCharacter} and never mutates its input; persistence is the
 * thin DB wrapper's job.
 */

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
