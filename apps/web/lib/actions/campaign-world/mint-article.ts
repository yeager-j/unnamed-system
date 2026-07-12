"use server"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { mintArticle } from "@/lib/db/writes/campaign-world"

import {
  MintArticleSchema,
  type MintArticleError,
  type MintArticleInput,
} from "./mint-article.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Quick-mints an Article into the gated campaign (UNN-575) — a plain row;
 * Articles are not entities. The write receives the gated campaign's own id
 * (§5's boundary rule).
 */
export async function mintArticleAction(
  input: MintArticleInput
): Promise<Result<{ id: string }, MintArticleError>> {
  const parsed = MintArticleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const minted = await mintArticle({
    campaignId: campaign.id,
    name: parsed.data.name,
    type: parsed.data.type ?? null,
  })
  revalidateCampaignWorld(campaign)
  return ok(minted)
}
