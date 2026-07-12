"use server"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  createSession,
  deleteSession,
  renameSession,
} from "@/lib/db/writes/campaign-notes"

import { revalidateCampaignNotes } from "./revalidate"
import {
  CreateSessionSchema,
  DeleteSessionSchema,
  RenameSessionSchema,
  type CreateSessionInput,
  type DeleteSessionInput,
  type RenameSessionInput,
  type SessionActionError,
} from "./session.schema"

/**
 * Session-folder writes (UNN-576, PRD FR-4). Sessions are purely
 * organizational — flat, never clock-coupled — so these are parse → gate →
 * LWW write → revalidate, with the write receiving the **gated** campaign's
 * id (§5).
 */

export async function createSessionAction(
  input: CreateSessionInput
): Promise<Result<{ id: string }, SessionActionError>> {
  const parsed = CreateSessionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const created = await createSession({
    campaignId: campaign.id,
    name: parsed.data.name,
  })
  revalidateCampaignNotes(campaign)
  return ok(created)
}

export async function renameSessionAction(
  input: RenameSessionInput
): Promise<Result<void, SessionActionError>> {
  const parsed = RenameSessionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const renamed = await renameSession({
    campaignId: campaign.id,
    sessionId: parsed.data.sessionId,
    name: parsed.data.name,
  })
  if (renamed.ok) revalidateCampaignNotes(campaign)
  return renamed
}

/** Deletes a session; its beats float to Unfiled via the FK's SET NULL. */
export async function deleteSessionAction(
  input: DeleteSessionInput
): Promise<Result<void, SessionActionError>> {
  const parsed = DeleteSessionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const deleted = await deleteSession({
    campaignId: campaign.id,
    sessionId: parsed.data.sessionId,
  })
  if (deleted.ok) revalidateCampaignNotes(campaign)
  return deleted
}
