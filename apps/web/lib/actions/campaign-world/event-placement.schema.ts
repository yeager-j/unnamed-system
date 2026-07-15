import { z } from "zod/v4"

/**
 * Input schemas for the event-placement actions (UNN-627): an **event** Article
 * fans across many days, one placement row per occurrence (a holiday, a lunar
 * full moon, a weekly sale). Add places one occurrence; remove drops one and
 * leaves the rest.
 */
export const AddEventPlacementSchema = z.object({
  campaignId: z.string(),
  articleId: z.string(),
  day: z.number().int().min(1).max(10_000),
})

export type AddEventPlacementInput = z.input<typeof AddEventPlacementSchema>

export const RemoveEventPlacementSchema = z.object({
  campaignId: z.string(),
  placementId: z.string(),
})

export type RemoveEventPlacementInput = z.input<
  typeof RemoveEventPlacementSchema
>

export type AddEventPlacementActionError =
  | "invalid-input"
  | "article-not-found"
  | "placement-exists"
  | "article-is-deadline"

export type RemoveEventPlacementActionError =
  | "invalid-input"
  | "placement-not-found"
