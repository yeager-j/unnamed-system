import { z } from "zod/v4"

/**
 * Input schema for {@link import("./set-campaign").setEntityCampaignAction}
 * (UNN-556, repointing UNN-328): the entity to (un)place and the destination —
 * a campaign id to place / move, or `null` to unplace.
 */
export const SetEntityCampaignSchema = z.object({
  entityId: z.string().min(1),
  campaignId: z.string().nullable(),
})

export type SetEntityCampaignInput = z.input<typeof SetEntityCampaignSchema>

export type SetEntityCampaignError =
  | "invalid-input"
  | "entity-not-found"
  | "live-encounter-lock"
