"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { addDays } from "@/lib/db/writes/campaign-clock"

import {
  AddDaysSchema,
  type AddDaysError,
  type AddDaysInput,
} from "./add-days.schema"
import { revalidateCampaignClock } from "./revalidate"

/**
 * Add-days (the Calendar's add bar, D1): materializes template slots for
 * `(horizon, horizon + days]`, extending the derived horizon without moving
 * `currentDay`. Clock-structural, so it rides the `clockVersion` CAS like
 * advance.
 */
export async function addDaysAction(
  input: AddDaysInput
): Promise<Result<{ currentDay: number; clockVersion: number }, AddDaysError>> {
  const parsed = AddDaysSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await addDays(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
