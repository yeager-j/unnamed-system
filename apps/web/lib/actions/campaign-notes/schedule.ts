"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { clearBeatSchedule, scheduleBeat } from "@/lib/db/writes/campaign-notes"

import { revalidateCampaignNotes } from "./revalidate"
import {
  ClearBeatScheduleSchema,
  ScheduleBeatSchema,
  type ClearBeatScheduleInput,
  type ScheduleActionError,
  type ScheduleBeatInput,
} from "./schedule.schema"

/**
 * Beat schedule flips (UNN-576, PRD FR-4): a beat is scheduled to a concrete
 * slot, **floating** ("run anytime"), or not scheduled — one fact, three
 * states. The write layer enforces D1's frozen-past rule on both the current
 * and the target slot, and the one-beat-per-slot partial unique surfaces a
 * lost race as `"slot-occupied"`.
 */

export async function scheduleBeatAction(
  input: ScheduleBeatInput
): Promise<Result<void, ScheduleActionError>> {
  const parsed = ScheduleBeatSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const scheduled = await scheduleBeat({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
    slotId: parsed.data.slotId,
  })
  if (scheduled.ok) revalidateCampaignNotes(campaign)
  return scheduled
}

export async function clearBeatScheduleAction(
  input: ClearBeatScheduleInput
): Promise<Result<void, ScheduleActionError>> {
  const parsed = ClearBeatScheduleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const cleared = await clearBeatSchedule({
    campaignId: campaign.id,
    beatId: parsed.data.beatId,
    floating: parsed.data.floating,
  })
  if (cleared.ok) revalidateCampaignNotes(campaign)
  return cleared
}
