"use server"

import { ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { clearPeriod, setPeriod } from "@/lib/db/writes/campaign-clock"

import {
  ClearPeriodSchema,
  SetPeriodSchema,
  type ClearPeriodInput,
  type PeriodError,
  type SetPeriodInput,
} from "./period.schema"
import { revalidateCampaignClock } from "./revalidate"

/**
 * Sets (or relabels) the period of a kind (season / month) starting on a day —
 * a sparse inherit-forward flavor marker (D1, FR-8, UNN-629). Last-write-wins
 * upsert per D6: single-author flavor, no version token.
 */
export async function setPeriodAction(
  input: SetPeriodInput
): Promise<Result<void, PeriodError>> {
  const parsed = SetPeriodSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  await setPeriod(parsed.data)
  revalidateCampaignClock(campaign)
  return ok(undefined)
}

/** Clears a day's period marker of a kind (the days it covered inherit the previous one). LWW. */
export async function clearPeriodAction(
  input: ClearPeriodInput
): Promise<Result<void, PeriodError>> {
  const parsed = ClearPeriodSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  await clearPeriod(parsed.data)
  revalidateCampaignClock(campaign)
  return ok(undefined)
}
