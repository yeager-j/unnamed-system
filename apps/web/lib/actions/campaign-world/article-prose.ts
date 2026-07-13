"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

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
 * The Article prose autosave (D10): name/body, LWW, and **deliberately no
 * revalidation** — the editor is client-owned while mounted (RSC seeds once);
 * a revalidate per ~800 ms debounce tick would re-render the page under the
 * typist. The tree row keeps up through the shell's name mirror; everything
 * else catches up on the next structural write's revalidation.
 */
export async function saveArticleProseAction(
  input: SaveArticleProseInput
): Promise<Result<void, SaveArticleProseError>> {
  const parsed = SaveArticleProseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  return saveArticleProse({
    campaignId: campaign.id,
    articleId: parsed.data.articleId,
    patch: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
    },
  })
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
