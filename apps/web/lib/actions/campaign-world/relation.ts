"use server"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { validateParticipantRefs } from "@/lib/db/queries/load-participants"
import { addRelation, removeRelation } from "@/lib/db/writes/campaign-world"

import {
  AddRelationSchema,
  RemoveRelationSchema,
  type AddRelationError,
  type AddRelationInput,
  type RemoveRelationError,
  type RemoveRelationInput,
} from "./relation.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Relation edge writes (UNN-579, §3). Both endpoints pass the §5 boundary
 * check (`validateParticipantRefs` — campaign-scoped, tombstone-strict:
 * nothing new may point at a tombstone) before any row lands.
 */
export async function addRelationAction(
  input: AddRelationInput
): Promise<Result<{ id: string }, AddRelationError>> {
  const parsed = AddRelationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const refs = await validateParticipantRefs(campaign.id, [
    parsed.data.source,
    parsed.data.target,
  ])
  if (!refs.ok) return err("invalid-ref")

  const trimmedLabel = parsed.data.label?.trim() ?? ""
  const row = await addRelation({
    campaignId: campaign.id,
    source: parsed.data.source,
    target: parsed.data.target,
    label: trimmedLabel === "" ? null : trimmedLabel,
    alsoReverse: parsed.data.alsoReverse,
  })
  revalidateCampaignWorld(campaign)
  return ok(row)
}

export async function removeRelationAction(
  input: RemoveRelationInput
): Promise<Result<void, RemoveRelationError>> {
  const parsed = RemoveRelationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await removeRelation({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
