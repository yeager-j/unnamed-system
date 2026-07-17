"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { redateUpdate } from "@/lib/db/writes/campaign-updates"

import {
  RedateUpdateSchema,
  type RedateUpdateActionError,
  type RedateUpdateInput,
} from "./redate.schema"
import { revalidateCampaignUpdates } from "./revalidate"

/**
 * Re-dates an update (FR-12, UNN-580): moves the row to another past day,
 * **detaching** it from its slot if it had one (D3 — a slot's day is a fact,
 * not an opinion). Refuses while the row is a ⚑ marker
 * (`update-resolves-deadline` — unbind first, D5).
 */
export async function redateUpdateAction(
  input: RedateUpdateInput
): Promise<Result<void, RedateUpdateActionError>> {
  const parsed = RedateUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await redateUpdate({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignUpdates(campaign)
  return result
}
