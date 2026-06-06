"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { deleteCampaign } from "@/lib/db/writes/campaign"

import {
  DeleteCampaignSchema,
  type DeleteCampaignError,
  type DeleteCampaignInput,
} from "./delete-campaign.schema"

/**
 * Permanently deletes a campaign (UNN-330, DM-only). `requireCampaignDM` gates it
 * and hands back the row so we can re-check the typed `confirmationName` against
 * the campaign's name (defense-in-depth behind the type-to-confirm dialog,
 * mirroring `deleteCharacterAction`). Refuses with `live-encounter-exists` while
 * a `live` encounter is running. On success the cascade FKs drop the encounters
 * + memberships and unplace the characters (see {@link deleteCampaign}); the
 * client redirects to `/campaigns`.
 */
export async function deleteCampaignAction(
  input: DeleteCampaignInput
): Promise<Result<void, DeleteCampaignError>> {
  const parsed = DeleteCampaignSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const typed = parsed.data.confirmationName?.trim() ?? ""
  if (typed !== campaign.name.trim()) return err("name-mismatch")

  const result = await deleteCampaign(campaign.id)
  if (!result.ok) return result

  revalidatePath("/campaigns")
  return ok(undefined)
}
