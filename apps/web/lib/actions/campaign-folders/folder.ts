"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
} from "@/lib/db/writes/campaign-folders"

import {
  CreateFolderSchema,
  DeleteFolderSchema,
  MoveFolderSchema,
  RenameFolderSchema,
  type CreateFolderInput,
  type DeleteFolderInput,
  type FolderActionError,
  type MoveFolderActionError,
  type MoveFolderInput,
  type RenameFolderInput,
} from "./folder.schema"
import { revalidateCampaignFolders } from "./revalidate"

/**
 * The folder trees' structural writes (UNN-579, tech-design D11) — one set of
 * actions for all three forests (Articles, NPCs, Session Notes; UNN-617). All
 * gate on `requireCampaignDM`; parent/kind agreement and the cycle guard live
 * in the write wrappers (`lib/db/writes/campaign-folders.ts`). Structural, so
 * every success revalidates the campaign layout.
 */

export async function createFolderAction(
  input: CreateFolderInput
): Promise<Result<{ id: string }, FolderActionError>> {
  const parsed = CreateFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await createFolder({ ...parsed.data, campaignId: campaign.id })
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}

export async function renameFolderAction(
  input: RenameFolderInput
): Promise<Result<void, FolderActionError>> {
  const parsed = RenameFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await renameFolder({ ...parsed.data, campaignId: campaign.id })
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}

export async function moveFolderAction(
  input: MoveFolderInput
): Promise<Result<void, MoveFolderActionError>> {
  const parsed = MoveFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await moveFolder({ ...parsed.data, campaignId: campaign.id })
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}

export async function deleteFolderAction(
  input: DeleteFolderInput
): Promise<Result<void, FolderActionError>> {
  const parsed = DeleteFolderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await deleteFolder({ ...parsed.data, campaignId: campaign.id })
  if (result.ok) revalidateCampaignFolders(campaign)
  return result
}
