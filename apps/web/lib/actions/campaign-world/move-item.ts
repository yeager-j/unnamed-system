"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  moveArticleToFolder,
  moveNpcToFolder,
} from "@/lib/db/writes/campaign-folders"

import {
  MoveArticleToFolderSchema,
  MoveNpcToFolderSchema,
  type MoveArticleToFolderInput,
  type MoveItemActionError,
  type MoveNpcToFolderInput,
} from "./move-item.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * "Move to…" for tree items (UNN-579, D11): re-files an Article or NPC into a
 * folder (null ⇒ Unfiled). The write wrapper enforces the §5 boundary — the
 * target folder must be same-campaign, same-kind.
 */

export async function moveArticleToFolderAction(
  input: MoveArticleToFolderInput
): Promise<Result<void, MoveItemActionError>> {
  const parsed = MoveArticleToFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await moveArticleToFolder({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}

export async function moveNpcToFolderAction(
  input: MoveNpcToFolderInput
): Promise<Result<void, MoveItemActionError>> {
  const parsed = MoveNpcToFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await moveNpcToFolder({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
