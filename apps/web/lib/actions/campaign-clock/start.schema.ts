import { z } from "zod/v4"

/**
 * Input schema for {@link import("./start").startClockAction} (D1/D10).
 * `startingDay` lets a DM adopting a mid-flight campaign mint the clock at
 * "we're 40 days in"; it defaults to 1. The cap is a runaway guard, not a
 * game rule. No `expectedVersion` — start is insert-once (the PK is the
 * guard), there is no prior version to compare.
 */
export const StartClockSchema = z.object({
  campaignId: z.string(),
  startingDay: z.number().int().min(1).max(9999).default(1),
})

export type StartClockInput = z.input<typeof StartClockSchema>

export type StartClockError = "invalid-input" | "clock-exists"
