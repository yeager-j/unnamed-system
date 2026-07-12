"use server"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { clearSeason, setSeason } from "@/lib/db/writes/campaign-clock"

import { revalidateCampaignClock } from "./revalidate"
import {
  ClearSeasonSchema,
  SetSeasonSchema,
  type ClearSeasonInput,
  type SeasonError,
  type SetSeasonInput,
} from "./season.schema"

/**
 * Sets (or relabels) the season starting on a day — a sparse inherit-forward
 * flavor marker (D1, FR-8). Last-write-wins upsert per D6: single-author
 * flavor, no version token.
 */
export async function setSeasonAction(
  input: SetSeasonInput
): Promise<Result<void, SeasonError>> {
  const parsed = SetSeasonSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  await setSeason(parsed.data)
  revalidateCampaignClock(campaign)
  return ok(undefined)
}

/** Clears a day's season marker (the days it covered inherit the previous one). LWW. */
export async function clearSeasonAction(
  input: ClearSeasonInput
): Promise<Result<void, SeasonError>> {
  const parsed = ClearSeasonSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  await clearSeason(parsed.data)
  revalidateCampaignClock(campaign)
  return ok(undefined)
}
