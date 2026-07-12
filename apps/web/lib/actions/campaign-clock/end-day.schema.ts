import { z } from "zod/v4"

export const EndDaySchema = z.object({
  campaignId: z.string(),
  mode: z.enum(["resolve-all", "defer-unresolved"]),
  expectedVersion: z.number().int().min(0),
})
export type EndDayInput = z.input<typeof EndDaySchema>

export type EndDayActionError = "invalid-input" | "clock-not-found" | "stale"
