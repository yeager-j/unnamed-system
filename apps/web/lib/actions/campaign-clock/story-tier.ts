"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { setStoryTier } from "@/lib/db/writes/campaign-clock"

import { revalidateCampaignClock } from "./revalidate"
import {
  SetStoryTierSchema,
  type SetStoryTierError,
  type SetStoryTierInput,
} from "./story-tier.schema"

/**
 * Sets the campaign's story tier (UNN-581, D8) — the party's shared arc the
 * runner-header control and the Day-End nudge both write through. Rides the
 * clock CAS, so the two surfaces converge on one advance.
 */
export async function setStoryTierAction(
  input: SetStoryTierInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, SetStoryTierError>
> {
  const parsed = SetStoryTierSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setStoryTier(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
