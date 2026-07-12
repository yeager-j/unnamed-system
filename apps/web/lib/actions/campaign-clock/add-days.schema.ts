import { z } from "zod/v4"

/**
 * Input schema for {@link import("./add-days").addDaysAction} (Calendar's
 * add-days bar, D1): extend the horizon by `days` without moving
 * `currentDay`. Same runaway cap as advance.
 */
export const AddDaysSchema = z.object({
  campaignId: z.string(),
  days: z.number().int().min(1).max(365),
  expectedVersion: z.number().int().min(0),
})

export type AddDaysInput = z.input<typeof AddDaysSchema>

export type AddDaysError = "invalid-input" | "clock-not-found" | "stale"
