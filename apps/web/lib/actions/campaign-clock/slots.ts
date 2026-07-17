"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { addSlot, renameSlot } from "@/lib/db/writes/campaign-clock"

import { revalidateCampaignClock } from "./revalidate"
import {
  AddSlotSchema,
  RenameSlotSchema,
  type AddSlotError,
  type AddSlotInput,
  type RenameSlotError,
  type RenameSlotInput,
} from "./slots.schema"

/**
 * Per-day "+ Add slot" (D1): appends a slot row after the day's last ordinal —
 * a row edit on that day only, never the template. Frozen for past days;
 * refuses days the clock hasn't materialized (the affordance only renders on
 * existing days).
 */
export async function addSlotAction(
  input: AddSlotInput
): Promise<Result<{ currentDay: number; clockVersion: number }, AddSlotError>> {
  const parsed = AddSlotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await addSlot(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}

/**
 * Renames a slot in place (D1: created, renamed, deleted — never moved). The
 * slot is validated against the gated campaign (§5's boundary rule — a
 * cross-campaign `slotId` reads as `"slot-not-found"`) and frozen once its
 * day is past.
 */
export async function renameSlotAction(
  input: RenameSlotInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, RenameSlotError>
> {
  const parsed = RenameSlotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await renameSlot(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
