import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create-campaign").createCampaignAction}
 * (UNN-329). A campaign needs a name; the description is optional flavor. The DM
 * is the signed-in caller, not an input field, and the `shortId` / `joinToken`
 * are minted server-side — so neither is accepted here.
 */
export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
})

export type CreateCampaignInput = z.input<typeof CreateCampaignSchema>

export type CreateCampaignError = "invalid-input"
