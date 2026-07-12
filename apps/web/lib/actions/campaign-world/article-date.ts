"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  clearArticleDate,
  setArticleDate,
} from "@/lib/db/writes/campaign-world"

import {
  ClearArticleDateSchema,
  SetArticleDateSchema,
  type ArticleDateActionError,
  type ClearArticleDateInput,
  type SetArticleDateInput,
} from "./article-date.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Sets (or re-dates) an article's dated facet (D5, UNN-578): an inert calendar
 * `event` or a `deadline` that counts down and hard-gates the clock's advance.
 * A resolved article refuses with `"article-resolved"` — re-dating requires
 * re-opening first, so "resolved before it looms" is never representable.
 */
export async function setArticleDateAction(
  input: SetArticleDateInput
): Promise<Result<void, ArticleDateActionError>> {
  const parsed = SetArticleDateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setArticleDate(parsed.data)
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}

/** Clears an article's dated facet (both columns). Same resolved guard as {@link setArticleDateAction}. */
export async function clearArticleDateAction(
  input: ClearArticleDateInput
): Promise<Result<void, ArticleDateActionError>> {
  const parsed = ClearArticleDateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await clearArticleDate(parsed.data)
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
