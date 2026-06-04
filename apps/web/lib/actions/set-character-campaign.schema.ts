import { z } from "zod/v4"

/**
 * Input schema for
 * {@link import("./set-character-campaign").setCharacterCampaignAction}
 * (UNN-328): the character to (un)place and the destination — a campaign id to
 * place / move, or `null` to unplace.
 */
export const SetCharacterCampaignSchema = z.object({
  characterId: z.string(),
  campaignId: z.string().nullable(),
})

export type SetCharacterCampaignInput = z.input<
  typeof SetCharacterCampaignSchema
>

export type SetCharacterCampaignError =
  | "invalid-input"
  | "character-not-found"
  | "live-encounter-lock"
