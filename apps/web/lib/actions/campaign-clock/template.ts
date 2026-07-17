"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { setSlotTemplate } from "@/lib/db/writes/campaign-clock"

import { revalidateCampaignClock } from "./revalidate"
import {
  SetSlotTemplateSchema,
  type SetSlotTemplateError,
  type SetSlotTemplateInput,
} from "./template.schema"

/**
 * Edits the default-slots template (Manage Campaign → "Day structure", D1).
 * Forward-only by construction: the template is read at materialization time,
 * so only days materialized after this write are affected — already-standing
 * days keep their rows.
 */
export async function setSlotTemplateAction(
  input: SetSlotTemplateInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, SetSlotTemplateError>
> {
  const parsed = SetSlotTemplateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setSlotTemplate(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
