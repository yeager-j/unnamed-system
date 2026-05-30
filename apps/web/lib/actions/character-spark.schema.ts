import { z } from "zod/v4"

import type { SparkPersistenceError } from "@/lib/db/writes/spark"
import { VIRTUE_KEYS } from "@/lib/game/character"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the sheet-side Spark / Virtue rank-up pickers
 * (PRD §6.1 / §7.5). Both writes target the progression-class version
 * column. The `virtue` field is enum-validated against the canonical four
 * so a tampered payload bails before the database round-trip.
 */

export const AddSparkSchema = characterMutationBase.extend({
  virtue: z.enum(VIRTUE_KEYS),
})
export type AddSparkInput = z.input<typeof AddSparkSchema>

export const RankUpVirtueSchema = characterMutationBase.extend({
  virtue: z.enum(VIRTUE_KEYS),
})
export type RankUpVirtueInput = z.input<typeof RankUpVirtueSchema>

export type SparkActionError = "invalid-input" | SparkPersistenceError
