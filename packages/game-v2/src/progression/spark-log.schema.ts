import { z } from "zod/v4"

import { VIRTUE_KEYS } from "@workspace/game-v2/kernel/vocab"

/**
 * Spark log capacity (rulebook 1.2) — re-declared in v2 (D32), matching v1's
 * `SPARK_LOG_CAPACITY`. At capacity, `addSpark` refuses (`log-full`) and the
 * player must rank a Virtue up before more Sparks accrue.
 */
export const SPARK_LOG_CAPACITY = 7

/**
 * The **SparkLog** component (CH17) — the ordered log of Sparks earned since the
 * last Virtue rank-up, each entry tagged with the Virtue that produced it. A
 * Virtue is eligible for rank-up when it appears in a full log; rank-up clears the
 * log to `[]` (its lifecycle is tied to rank-up, never rest).
 *
 * The Spark/rank-up *transitions* land in E1/UNN-544; S0 mints only the stored
 * shape (byte-identical to v1's `sparkLogSchema`) so the entity table and the
 * conformance test have it at table creation.
 */
export const sparkLogSchema = z
  .array(z.enum(VIRTUE_KEYS))
  .max(SPARK_LOG_CAPACITY)

export type SparkLog = z.infer<typeof sparkLogSchema>
