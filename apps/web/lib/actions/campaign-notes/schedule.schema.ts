import { z } from "zod/v4"

export const ScheduleBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  slotId: z.string(),
})
export type ScheduleBeatInput = z.input<typeof ScheduleBeatSchema>

export const ClearBeatScheduleSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  /** `true` ⇒ Floating ("run anytime"); `false` ⇒ Not scheduled. */
  floating: z.boolean(),
})
export type ClearBeatScheduleInput = z.input<typeof ClearBeatScheduleSchema>

export type ScheduleActionError =
  | "invalid-input"
  | "beat-not-found"
  | "slot-not-found"
  | "clock-not-found"
  | "frozen-day"
  | "slot-occupied"
