import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"
import {
  MAX_VIRTUE_RANK,
  SPARK_LOG_CAPACITY,
  type SparkLog,
  type Virtues,
} from "@workspace/game-v2/virtues/virtues.schema"

/**
 * Spark resolution, re-homed from v1 (`engine/character/leveling.ts`): earning a
 * Spark, computing which Virtues are eligible, and ranking one up (rulebook 1.2).
 * Pure — every transition returns a fresh {@link Virtues} component and never
 * mutates its input.
 *
 * It operates on the single `virtues` component (ranks + log together); a rank-up
 * touches both, so the op reads and rewrites the whole component in one step —
 * there is no separate `sparkLog` component to patch.
 */

/**
 * Expected, recoverable failures (not programmer errors): the log is already
 * full, not yet full, the chosen Virtue is absent from the log, or it is already
 * at the rank ceiling.
 */
export type SparkError =
  | "log-full"
  | "log-not-full"
  | "virtue-not-eligible"
  | "rank-capped"

/**
 * Appends a Spark tagged with `virtue`. Fails with `log-full` once the log holds
 * {@link SPARK_LOG_CAPACITY} Sparks — the player must rank up before earning more.
 */
export function addSpark(
  virtues: Virtues,
  virtue: VirtueKey
): Result<Virtues, SparkError> {
  if (virtues.sparkLog.length >= SPARK_LOG_CAPACITY) return err("log-full")

  return ok({ ...virtues, sparkLog: [...virtues.sparkLog, virtue] })
}

/**
 * The Virtues that may be ranked up right now: those appearing at least once in a
 * full log. An incomplete log makes nothing eligible (rank-up only happens at
 * exactly {@link SPARK_LOG_CAPACITY} Sparks).
 */
export function eligibleVirtuesForRankUp(virtues: Virtues): Set<VirtueKey> {
  if (virtues.sparkLog.length < SPARK_LOG_CAPACITY) return new Set()

  return new Set(virtues.sparkLog)
}

/**
 * Ranks up `virtue` by 1 and clears the log. Fails — without mutating — when the
 * log is not exactly full (`log-not-full`), the Virtue is not in the log
 * (`virtue-not-eligible`), or it is already at {@link MAX_VIRTUE_RANK}
 * (`rank-capped`, leaving the log intact so another eligible Virtue can be chosen
 * instead of wasting the Sparks).
 */
export function rankUpVirtue(
  virtues: Virtues,
  virtue: VirtueKey
): Result<Virtues, SparkError> {
  if (virtues.sparkLog.length !== SPARK_LOG_CAPACITY) return err("log-not-full")
  if (!eligibleVirtuesForRankUp(virtues).has(virtue)) {
    return err("virtue-not-eligible")
  }
  if (virtues.ranks[virtue] >= MAX_VIRTUE_RANK) return err("rank-capped")

  return ok({
    ranks: { ...virtues.ranks, [virtue]: virtues.ranks[virtue] + 1 },
    sparkLog: [],
  })
}

/**
 * The per-Virtue tally of a Spark log, for the sheet's "Wisdom ×2, Empathy ×1"
 * breakdown line. One entry per Virtue that appears at least once, ordered by
 * count descending then {@link VIRTUE_KEYS} order for ties (the stable sort over a
 * `VIRTUE_KEYS`-ordered base preserves that tiebreak). An empty log yields an
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
