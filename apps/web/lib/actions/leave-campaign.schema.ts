import { z } from "zod/v4"

/**
 * Input schema for {@link import("./leave-campaign").leaveCampaignAction}
 * (UNN-330): just the campaign to leave. The member is the signed-in caller, not
 * an input field.
 */
export const LeaveCampaignSchema = z.object({
  campaignId: z.string(),
})

export type LeaveCampaignInput = z.input<typeof LeaveCampaignSchema>

export type LeaveCampaignError = "invalid-input" | "live-encounter-lock"
