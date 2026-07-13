"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { casNpcBondTier } from "@/lib/db/writes/campaign-world"

import {
  SetNpcBondTierSchema,
  type SetNpcBondTierError,
  type SetNpcBondTierInput,
} from "./bond.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * The one bond-tier write (UNN-581, D8) — the confirm's advance, the DM's
 * manual set, and a regress are all the same CAS through here, and every path
 * stamps `bondTierChangedAt` (a regress therefore restarts the derived
 * progress clock — the documented cost). The app never auto-advances.
 */
export async function setNpcBondTierAction(
  input: SetNpcBondTierInput
): Promise<Result<void, SetNpcBondTierError>> {
  const parsed = SetNpcBondTierSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await casNpcBondTier({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
