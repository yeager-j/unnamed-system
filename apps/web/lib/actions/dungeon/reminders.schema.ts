import { z } from "zod/v4"

import { randomEncounterIntervalSchema } from "@workspace/game-v2/spatial"

import type { DungeonWriteError } from "@/lib/db/writes/dungeon"

/**
 * Input schemas for the DM-only random-encounter reminder settings (PRD FR-4) —
 * **per-field** actions (the UNN-226 discipline): each toggles ONE field and the
 * server reads the dungeon row and merges it, so two rapid edits can't clobber via
 * a client-built full object. Exhaustion-onset is always-on with no setting, so it
 * has no action here.
 */
export const SetRandomEncountersEnabledSchema = z.object({
  dungeonId: z.string(),
  enabled: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
})

export type SetRandomEncountersEnabledInput = z.input<
  typeof SetRandomEncountersEnabledSchema
>

export const SetRandomEncounterIntervalSchema = z.object({
  dungeonId: z.string(),
  intervalTurns: randomEncounterIntervalSchema,
  expectedVersion: z.number().int().nonnegative(),
})

export type SetRandomEncounterIntervalInput = z.input<
  typeof SetRandomEncounterIntervalSchema
>

export type ReminderSettingError =
  | "invalid-input"
  | "dungeon-not-found"
  | DungeonWriteError
