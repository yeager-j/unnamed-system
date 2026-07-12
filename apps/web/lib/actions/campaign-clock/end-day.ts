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
 * The day-end warning's proceed paths (UNN-577, PRD FR-5): **Resolve All**
 * or **Defer Unresolved**, then advance — one transaction (bulk beat/claim
 * treatment + Idle fill + materialize tomorrow + `clockVersion` CAS last).
 * A ready day skips this and takes the plain `advanceClockAction`; the
 * server recounts inside the transaction either way, so a stale client's
 * warning can't resolve or defer anything that no longer needs it.
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
