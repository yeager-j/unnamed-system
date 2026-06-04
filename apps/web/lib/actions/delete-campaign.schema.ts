import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete-campaign").deleteCampaignAction}
 * (UNN-330). `confirmationName` is the value typed into the type-to-confirm
 * dialog (mirrors `DeleteCharacterSchema`); the action re-checks it against the
 * campaign's name as defense-in-depth.
 */
export const DeleteCampaignSchema = z.object({
  campaignId: z.string(),
  confirmationName: z.string().optional(),
})

export type DeleteCampaignInput = z.input<typeof DeleteCampaignSchema>

export type DeleteCampaignError =
  | "invalid-input"
  | "name-mismatch"
  | "live-encounter-exists"
