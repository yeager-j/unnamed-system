"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import type { ParticipantRef } from "@/domain/planner/participant"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { validateParticipantRefs } from "@/lib/db/queries/load-participants"
import {
  deleteActivity,
  editActivity,
  recordActivity,
  type RecordActivitySuccess,
} from "@/lib/db/writes/campaign-updates"

import {
  DeleteActivitySchema,
  EditActivitySchema,
  RecordActivitySchema,
  type ActivityActionError,
  type DeleteActivityInput,
  type EditActivityInput,
  type RecordActivityInput,
} from "./activity.schema"
import { revalidateCampaignUpdates } from "./revalidate"

/**
 * The downtime recording actions (UNN-576, D3/PRD FR-2/3): record / edit /
 * delete a character's activity — one `campaignUpdate` row carrying the
 * downtime facet. Gate is `requireCampaignDM` alone (rewards were removed:
 * the clock writes nothing to a character, FR-3). Every participant ref the
 * wire supplies — the primary character, the concerns, the copy targets —
 * validates against the gated campaign before writing (§5's boundary rule).
 */

export async function recordActivityAction(
  input: RecordActivityInput
): Promise<Result<RecordActivitySuccess, ActivityActionError>> {
  const parsed = RecordActivitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }
  const { campaignId, slotId, characterId, alsoCharacterIds, body, category } =
    parsed.data

  const campaign = await requireCampaignDM(campaignId)
  const refs: ParticipantRef[] = [
    { kind: "character", id: characterId },
    ...alsoCharacterIds.map(
      (id): ParticipantRef => ({ kind: "character", id })
    ),
    ...parsed.data.concerns,
  ]
  const validated = await validateParticipantRefs(campaign.id, refs)
  if (!validated.ok) return validated

  const recorded = await recordActivity({
    campaignId: campaign.id,
    slotId,
    characterId,
    body,
    category,
    concerns: parsed.data.concerns,
    alsoCharacterIds,
  })
  if (recorded.ok) revalidateCampaignUpdates(campaign)
  return recorded
}

export async function editActivityAction(
  input: EditActivityInput
): Promise<Result<void, ActivityActionError>> {
  const parsed = EditActivitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const validated = await validateParticipantRefs(
    campaign.id,
    parsed.data.concerns
  )
  if (!validated.ok) return validated

  const edited = await editActivity({
    campaignId: campaign.id,
    updateId: parsed.data.updateId,
    body: parsed.data.body,
    category: parsed.data.category,
    concerns: parsed.data.concerns,
  })
  if (edited.ok) revalidateCampaignUpdates(campaign)
  return edited
}

export async function deleteActivityAction(
  input: DeleteActivityInput
): Promise<Result<void, ActivityActionError>> {
  const parsed = DeleteActivitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const deleted = await deleteActivity({
    campaignId: campaign.id,
    updateId: parsed.data.updateId,
  })
  if (deleted.ok) revalidateCampaignUpdates(campaign)
  return deleted
}
