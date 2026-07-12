"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { softDeleteArticle } from "@/lib/db/writes/campaign-world"

import {
  DeleteArticleSchema,
  type DeleteArticleError,
  type DeleteArticleInput,
} from "./delete-article.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Tombstones an Article (D4): the row soft-deletes out of the linker and list
 * surfaces while history keeps rendering its name muted.
 */
export async function deleteArticleAction(
  input: DeleteArticleInput
): Promise<Result<void, DeleteArticleError>> {
  const parsed = DeleteArticleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await softDeleteArticle({
    campaignId: campaign.id,
    articleId: parsed.data.articleId,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
