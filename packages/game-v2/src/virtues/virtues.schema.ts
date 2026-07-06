import { z } from "zod/v4"

import { VIRTUE_KEYS } from "@workspace/game-v2/kernel/vocab"

/**
 * The **Virtues** component (CH17) — the character's four Social Virtue ranks
 * (Expression / Empathy / Wisdom / Focus) **and** the Spark progress log that
 * feeds them. Durable; **progression** version class.
 *
 * Ranks and the log are one component, not two (E1/UNN-552, reversing S0's split):
 * `rankUpVirtue` reads and writes **both** atomically, which is exactly the
 * granularity signal for a single component (the smallest cluster one system
 * reads/writes together, O1/D8) — and v1 modeled them together too
 * (`SparkCharacter { sparkLog, virtues }`). The rank-up / creation-allocation
 * *transitions* live beside this schema in `virtues/` (`spark.ts`,
 * `virtue-allocation.ts`).
 */

/** The Virtue rank ceiling (rulebook 1.2) — a Virtue ranks from 0 to at most this. */
export const MAX_VIRTUE_RANK = 7

/**
 * Spark log capacity (rulebook 1.2) — at capacity, `addSpark` refuses (`log-full`)
 * and the player must rank a Virtue up before more Sparks accrue.
 */
export const SPARK_LOG_CAPACITY = 7

const virtueRankSchema = z.number().int().min(0).max(MAX_VIRTUE_RANK)

/** The four Virtue ranks — the creation allocation validators produce this shape. */
export const virtueRanksSchema = z.object({
  expression: virtueRankSchema,
  empathy: virtueRankSchema,
  wisdom: virtueRankSchema,
  focus: virtueRankSchema,
})

export type VirtueRanks = z.infer<typeof virtueRanksSchema>

/**
 * The ordered log of Sparks earned since the last Virtue rank-up, each entry
 * tagged with the Virtue that produced it. A Virtue is eligible for rank-up when
 * it appears in a full log; rank-up clears the log to `[]` (its lifecycle is tied
 * to rank-up, never rest).
 */
export const sparkLogSchema = z
  .array(z.enum(VIRTUE_KEYS))
  .max(SPARK_LOG_CAPACITY)

export type SparkLog = z.infer<typeof sparkLogSchema>

export const virtuesSchema = z.object({
  ranks: virtueRanksSchema,
  sparkLog: sparkLogSchema,
})

export type Virtues = z.infer<typeof virtuesSchema>
