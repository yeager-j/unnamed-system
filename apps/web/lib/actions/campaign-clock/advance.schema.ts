import { z } from "zod/v4"

/**
 * Input schemas for {@link import("./advance").advanceClockAction} and
 * {@link import("./advance").unAdvanceClockAction} (D1/D6). `days: 1` is the
 * plain advance; `days > 1` is a time-skip — one write either way. The cap is
 * a runaway guard (a fat-fingered skip must not materialize thousands of slot
 * rows), not a game rule. Un-advance is strictly one day at a time, so it
 * carries no `days`.
 */
export const AdvanceClockSchema = z.object({
  campaignId: z.string(),
  days: z.number().int().min(1).max(365),
  expectedVersion: z.number().int().min(0),
})

export type AdvanceClockInput = z.input<typeof AdvanceClockSchema>

export type AdvanceClockError = "invalid-input" | "clock-not-found" | "stale"

export const UnAdvanceClockSchema = z.object({
  campaignId: z.string(),
  expectedVersion: z.number().int().min(0),
})

export type UnAdvanceClockInput = z.input<typeof UnAdvanceClockSchema>

export type UnAdvanceClockError = AdvanceClockError | "at-floor"
