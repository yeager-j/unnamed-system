import { z } from "zod/v4"

export const CreateBeatSchema = z.object({
  campaignId: z.string(),
  sessionId: z.string().nullish(),
  /** Mint straight into a slot (the runner's "New story beat"). */
  slotId: z.string().optional(),
})
export type CreateBeatInput = z.input<typeof CreateBeatSchema>

export const MoveBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  sessionId: z.string().nullable(),
})
export type MoveBeatInput = z.input<typeof MoveBeatSchema>

export const DeleteBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
})
export type DeleteBeatInput = z.input<typeof DeleteBeatSchema>

export const DeferBeatSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
})
export type DeferBeatInput = z.input<typeof DeferBeatSchema>

export const SetBeatResolvedSchema = z.object({
  campaignId: z.string(),
  beatId: z.string(),
  resolved: z.boolean(),
})
export type SetBeatResolvedInput = z.input<typeof SetBeatResolvedSchema>

export type BeatActionError =
  | "invalid-input"
  | "beat-not-found"
  | "session-not-found"
  | "clock-not-found"
  | "scheduled-to-past"
  | "not-scheduled"
  | "slot-not-found"
  | "frozen-day"
  | "slot-occupied"
