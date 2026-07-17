"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { advanceClock, unAdvanceClock } from "@/lib/db/writes/campaign-clock"

import {
  AdvanceClockSchema,
  UnAdvanceClockSchema,
  type AdvanceClockError,
  type AdvanceClockInput,
  type UnAdvanceClockError,
  type UnAdvanceClockInput,
} from "./advance.schema"
import { revalidateCampaignClock } from "./revalidate"

/**
 * Advance the clock by `days` — 1 from "End the day", N from a time-skip; the
 * same write either way (D1). Materializes template slots for every day
 * entered and moves `currentDay`, one transaction with the `clockVersion` CAS
 * last, so a two-tab double-advance's loser gets `"stale"` and leaves no slot
 * rows behind.
 *
 * Both D1 riders live here (phase 5): the **advance gate** refuses
 * `"deadline-due"` while any unresolved deadline with `datedDay ≤ newDay`
 * exists, and a time-skip may carry the optional **montage pass** — one
 * update per participating character, stamped on the landing day.
 */
export async function advanceClockAction(
  input: AdvanceClockInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, AdvanceClockError>
> {
  const parsed = AdvanceClockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await advanceClock(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}

/**
 * Un-advance (D1): `currentDay -= 1`, strictly one day at a time and
 * **scoped** — it unbinds ⚑ markers stamped after the restored day (D5) and
 * nothing else; the confirm dialog owns saying so. `"at-floor"` refuses both
 * day 1 and backing into a day the clock never materialized (a mid-flight
 * start's day 39).
 */
export async function unAdvanceClockAction(
  input: UnAdvanceClockInput
): Promise<
  Result<{ currentDay: number; clockVersion: number }, UnAdvanceClockError>
> {
  const parsed = UnAdvanceClockSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await unAdvanceClock(parsed.data)
  if (result.ok) revalidateCampaignClock(campaign)
  return result
}
