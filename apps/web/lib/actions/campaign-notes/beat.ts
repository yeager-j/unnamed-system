"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  createBeat,
  deferBeat,
  deleteBeat,
  moveBeatToSession,
  setBeatResolved,
} from "@/lib/db/writes/campaign-notes"

import {
  CreateBeatSchema,
  DeferBeatSchema,
  DeleteBeatSchema,
  MoveBeatSchema,
  SetBeatResolvedSchema,
  type BeatActionError,
  type CreateBeatInput,
  type DeferBeatInput,
  type DeleteBeatInput,
  type MoveBeatInput,
  type SetBeatResolvedInput,
} from "./beat.schema"
import { revalidateCampaignNotes } from "./revalidate"

/**
 * Beat lifecycle writes (UNN-576/577, PRD FR-4/FR-5): create into a session
 * (or Unfiled) — optionally straight into a slot (the runner's "New story
 * beat") — refile, delete, defer to the floating shelf, and Mark resolved /
 * Reopen. Deleting is **blocked while the beat is scheduled to a past slot**
 * — history keeps its structure (D1); content edits are the prose autosave's
 * job (`prose.ts`), schedule flips are `schedule.ts`.
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
    slotId: parsed.data.slotId,
  })
  if (created.ok) revalidateCampaignNotes(campaign)
  return created
}

/** Defer (FR-5): unschedule to the floating shelf, recording provenance. */
export async function deferBeatAction(
  input: DeferBeatInput
): Promise<Result<void, BeatActionError>> {
  const parsed = DeferBeatSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const deferred = await deferBeat({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
  })
  if (deferred.ok) revalidateCampaignNotes(campaign)
  return deferred
}

/** Mark resolved / Reopen (FR-5). LWW. */
export async function setBeatResolvedAction(
  input: SetBeatResolvedInput
): Promise<Result<void, BeatActionError>> {
  const parsed = SetBeatResolvedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const set = await setBeatResolved({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
    resolved: parsed.data.resolved,
  })
  if (set.ok) revalidateCampaignNotes(campaign)
  return set
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
