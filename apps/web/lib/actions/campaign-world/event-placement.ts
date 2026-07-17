"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  addEventPlacement,
  removeEventPlacement,
} from "@/lib/db/writes/campaign-world"

import {
  AddEventPlacementSchema,
  RemoveEventPlacementSchema,
  type AddEventPlacementActionError,
  type AddEventPlacementInput,
  type RemoveEventPlacementActionError,
  type RemoveEventPlacementInput,
} from "./event-placement.schema"
import { revalidateCampaignWorld } from "./revalidate"

/**
 * Places an **event** Article onto a day (UNN-627): one occurrence in the
 * multi-placement set, so the same Article can recur across the calendar
 * without minting one Article per day. `requireCampaignDM` gates it; the write
 * validates the Article against the gated campaign (§5 boundary rule).
 */
export async function addEventPlacementAction(
  input: AddEventPlacementInput
): Promise<Result<{ placementId: string }, AddEventPlacementActionError>> {
  const parsed = AddEventPlacementSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await addEventPlacement(parsed.data)
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}

/** Removes one event placement (UNN-627); the Article's other placements survive. */
export async function removeEventPlacementAction(
  input: RemoveEventPlacementInput
): Promise<Result<void, RemoveEventPlacementActionError>> {
  const parsed = RemoveEventPlacementSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await removeEventPlacement(parsed.data)
  if (result.ok) revalidateCampaignWorld(campaign)
  return result
}
