import { z } from "zod/v4"

import type { SparkPersistenceError } from "@/lib/db/spark"
import { VIRTUE_KEYS } from "@/lib/game/character"

/**
 * Input schemas for the sheet-side Spark / Virtue rank-up pickers
 * (PRD §6.1 / §7.5). Both writes target the progression-class version
 * column. The `virtue` field is enum-validated against the canonical four
 * so a tampered payload bails before the database round-trip.
 */

export const AddSparkSchema = z.object({
  characterId: z.string().min(1),
  virtue: z.enum(VIRTUE_KEYS),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddSparkInput = z.input<typeof AddSparkSchema>

export const RankUpVirtueSchema = z.object({
  characterId: z.string().min(1),
  virtue: z.enum(VIRTUE_KEYS),
  expectedVersion: z.number().int().nonnegative(),
})
export type RankUpVirtueInput = z.input<typeof RankUpVirtueSchema>

export type SparkActionError = "invalid-input" | SparkPersistenceError
