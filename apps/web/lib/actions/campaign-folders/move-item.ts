"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  moveArticleToFolder,
  moveBeatToFolder,
  moveNpcToFolder,
} from "@/lib/db/writes/campaign-folders"

import {
  MoveArticleToFolderSchema,
  MoveBeatToFolderSchema,
  MoveNpcToFolderSchema,
  type MoveArticleToFolderInput,
  type MoveBeatToFolderInput,
  type MoveItemActionError,
  type MoveNpcToFolderInput,
} from "./move-item.schema"
import { revalidateCampaignFolders } from "./revalidate"

/**
 * "Move to…" for tree items (UNN-579, D11; beats UNN-617): re-files an
 * Article, NPC, or story beat into a folder (null ⇒ Unfiled). The write
 * wrapper enforces the §5 boundary — the target folder must be same-campaign,
 * same-kind.
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
  if (result.ok) revalidateCampaignFolders(campaign)
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
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}

export async function moveBeatToFolderAction(
  input: MoveBeatToFolderInput
): Promise<Result<void, MoveItemActionError>> {
  const parsed = MoveBeatToFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await moveBeatToFolder({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}
