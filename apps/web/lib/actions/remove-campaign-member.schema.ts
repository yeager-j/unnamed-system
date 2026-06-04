import { z } from "zod/v4"

/**
 * Input schema for
 * {@link import("./remove-campaign-member").removeCampaignMemberAction}
 * (UNN-329): the campaign and the member to remove.
 */
export const RemoveCampaignMemberSchema = z.object({
  campaignId: z.string(),
  userId: z.string(),
})

export type RemoveCampaignMemberInput = z.input<
  typeof RemoveCampaignMemberSchema
>

export type RemoveCampaignMemberError = "invalid-input"
