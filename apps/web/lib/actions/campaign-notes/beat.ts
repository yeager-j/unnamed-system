"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  createBeat,
  deleteBeat,
  moveBeatToSession,
} from "@/lib/db/writes/campaign-notes"

import {
  CreateBeatSchema,
  DeleteBeatSchema,
  MoveBeatSchema,
  type BeatActionError,
  type CreateBeatInput,
  type DeleteBeatInput,
  type MoveBeatInput,
} from "./beat.schema"
import { revalidateCampaignNotes } from "./revalidate"

/**
 * Beat lifecycle writes (UNN-576, PRD FR-4): create into a session (or
 * Unfiled), refile, delete. Deleting is **blocked while the beat is
 * scheduled to a past slot** — history keeps its structure (D1); content
 * edits are the prose autosave's job (`prose.ts`), schedule flips are
 * `schedule.ts`.
 */

export async function createBeatAction(
  input: CreateBeatInput
): Promise<Result<{ id: string }, BeatActionError>> {
  const parsed = CreateBeatSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const created = await createBeat({
    campaignId: campaign.id,
    sessionId: parsed.data.sessionId ?? null,
  })
  if (created.ok) revalidateCampaignNotes(campaign)
  return created
}

export async function moveBeatToSessionAction(
  input: MoveBeatInput
): Promise<Result<void, BeatActionError>> {
  const parsed = MoveBeatSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const moved = await moveBeatToSession({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
    sessionId: parsed.data.sessionId,
  })
  if (moved.ok) revalidateCampaignNotes(campaign)
  return moved
}

export async function deleteBeatAction(
  input: DeleteBeatInput
): Promise<Result<void, BeatActionError>> {
  const parsed = DeleteBeatSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const deleted = await deleteBeat({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
  })
  if (deleted.ok) revalidateCampaignNotes(campaign)
  return deleted
}
