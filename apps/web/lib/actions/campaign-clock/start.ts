"use server"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { DEFAULT_SLOT_TEMPLATE } from "@/domain/planner/slot-template"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { startClock } from "@/lib/db/writes/campaign-clock"

import { revalidateCampaignClock } from "./revalidate"
import {
  StartClockSchema,
  type StartClockError,
  type StartClockInput,
} from "./start.schema"

/**
 * "Start the clock" (D1/D10) — mints the campaign's clock record at
 * `startingDay` (default 1; a mid-flight campaign adopts "we're 40 days in")
 * and materializes that day's slots from {@link DEFAULT_SLOT_TEMPLATE}, one
 * transaction. Insert-once: a double-submit (or second tab) hits the PK and
 * returns `"clock-exists"` with nothing written. The template becomes
 * per-campaign editable in Manage Campaign ("Day structure") afterward.
 */
export async function startClockAction(
  input: StartClockInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, StartClockError>
> {
  const parsed = StartClockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await startClock({
    campaignId: parsed.data.campaignId,
    startingDay: parsed.data.startingDay,
    slotTemplate: DEFAULT_SLOT_TEMPLATE,
  })
  if (!result.ok) return result

  revalidateCampaignClock(campaign)
  return ok(result.value)
}
