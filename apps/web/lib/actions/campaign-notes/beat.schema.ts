import { z } from "zod/v4"

export const CreateBeatSchema = z.object({
  campaignId: z.string(),
  sessionId: z.string().nullish(),
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

export type BeatActionError =
  | "invalid-input"
  | "beat-not-found"
  | "session-not-found"
  | "clock-not-found"
  | "scheduled-to-past"
