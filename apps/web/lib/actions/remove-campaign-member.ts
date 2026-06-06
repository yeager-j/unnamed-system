"use server"

import { revalidatePath } from "next/cache"

import { ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { removeCampaignMember } from "@/lib/db/writes/campaign"

import {
  RemoveCampaignMemberSchema,
  type RemoveCampaignMemberError,
  type RemoveCampaignMemberInput,
} from "./remove-campaign-member.schema"

/**
 * Removes a player from a campaign's roster (DM-only) and unplaces their
 * characters (UNN-329 + the UNN-330 cascade). `requireCampaignDM` gates the
 * write; the DM can't remove themselves because they're `campaign.dmUserId`, not
 * a `campaignUsers` row. Revalidates the manage page so the roster re-renders.
 */
export async function removeCampaignMemberAction(
  input: RemoveCampaignMemberInput
): Promise<Result<null, RemoveCampaignMemberError>> {
  const parsed = RemoveCampaignMemberSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const result = await removeCampaignMember(campaign.id, parsed.data.userId)
  if (!result.ok) return result

  revalidatePath(`/campaigns/${campaign.shortId}`)

  return ok(null)
}
