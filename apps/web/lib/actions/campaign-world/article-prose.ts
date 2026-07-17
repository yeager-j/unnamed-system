"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  saveArticleProse,
  setArticleType,
} from "@/lib/db/writes/campaign-world"

import {
  SaveArticleProseSchema,
  SetArticleTypeSchema,
  type SaveArticleProseError,
  type SaveArticleProseInput,
  type SetArticleTypeError,
  type SetArticleTypeInput,
} from "./article-prose.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * The Article prose autosave (D10): name/body, LWW. Mid-edit debounce ticks
 * **don't revalidate** (a revalidate per ~800 ms would re-render the page under
 * the typist); the **terminal blur/unmount save sets `revalidate`** so the
 * world route cache refreshes once on leaving the field — otherwise a browser
 * Back restores the stale pre-edit RSC payload (UNN-621). Safe because the CM6
 * editor seeds once and ignores `serverValue` after mount.
 */
export async function saveArticleProseAction(
  input: SaveArticleProseInput
): Promise<Result<void, SaveArticleProseError>> {
  const parsed = SaveArticleProseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await saveArticleProse({
    campaignId: campaign.id,
    articleId: parsed.data.articleId,
    patch: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
    },
  })
  if (result.ok && parsed.data.revalidate) revalidateCampaignWorld(campaign)
  return result
}

/** Sets or clears the Article's label-only type tag. Structural — revalidates. */
export async function setArticleTypeAction(
  input: SetArticleTypeInput
): Promise<Result<void, SetArticleTypeError>> {
  const parsed = SetArticleTypeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await setArticleType({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
