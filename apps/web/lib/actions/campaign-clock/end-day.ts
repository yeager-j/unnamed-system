"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { endDay } from "@/lib/db/writes/campaign-clock"

import {
  EndDaySchema,
  type EndDayActionError,
  type EndDayInput,
} from "./end-day.schema"
import { revalidateCampaignClock } from "./revalidate"

/**
 * "End the day" (UNN-577, PRD FR-5): the ready path (**advance** — asserts
 * completeness server-side and refuses `"not-ready"`, since readiness facts
 * don't ride `clockVersion` and a stale tab's cue can lie) or the warning's
 * proceed paths (**Resolve All** / **Defer Unresolved**), then advance —
 * one transaction (bulk beat/claim treatment + Idle fill + materialize
 * tomorrow + `clockVersion` CAS last). The server recounts inside the
 * transaction in every mode, so a stale client can neither skip the warning
 * nor resolve/defer anything that no longer needs it. Time-skips (the ⋯
 * menu) stay on `advanceClockAction` — a multi-day skip is a deliberate
 * gesture the warning never gated.
 */
export async function endDayAction(
  input: EndDayInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, EndDayActionError>
> {
  const parsed = EndDaySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const result = await endDay({
    campaignId: campaign.id,
    mode: parsed.data.mode,
    expectedVersion: parsed.data.expectedVersion,
  })
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
