"use server"

import { revalidatePath } from "next/cache"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { setLineageGating } from "@/lib/db/writes/campaign"
import { campaignPath } from "@/lib/paths"

import {
  SetLineageGatingSchema,
  type SetLineageGatingError,
  type SetLineageGatingInput,
} from "./lineage-gating.schema"

/**
 * Flips the campaign's Lineage-gating opt-in (UNN-581, D8 — Manage Campaign).
 * The Atlas itself needs no revalidation: it renders per-request off the
 * campaign row; the campaign layout revalidates for the Manage card.
 */
export async function setLineageGatingAction(
  input: SetLineageGatingInput
): Promise<Result<void, SetLineageGatingError>> {
  const parsed = SetLineageGatingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  await setLineageGating({
    campaignId: campaign.id,
    enabled: parsed.data.enabled,
  })
  revalidatePath(campaignPath(campaign.shortId), "layout")
  return { ok: true, value: undefined }
}
