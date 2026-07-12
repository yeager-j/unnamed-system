import { z } from "zod/v4"

/**
 * Input schemas for {@link import("./season").setSeasonAction} /
 * {@link import("./season").clearSeasonAction} (D1, FR-8): sparse
 * inherit-forward flavor labels keyed `(campaignId, day)`. Last-write-wins —
 * no `expectedVersion` (D6: annoying, not corrupting).
 */
export const SetSeasonSchema = z.object({
  campaignId: z.string(),
  day: z.number().int().min(1),
  label: z.string().trim().min(1).max(60),
})

export type SetSeasonInput = z.input<typeof SetSeasonSchema>

export const ClearSeasonSchema = z.object({
  campaignId: z.string(),
  day: z.number().int().min(1),
})

export type ClearSeasonInput = z.input<typeof ClearSeasonSchema>

export type SeasonError = "invalid-input"
