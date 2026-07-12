"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

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
 * Two D1 riders land with later phases and slot into this action, not a new
 * one: the **advance gate** (block while any unresolved deadline ≤ newDay
 * exists — dated Articles, phase 5) and the time-skip **montage pass** (one
 * downtime update per character stamped on the landing day — the update
 * stream, phase 3).
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
 * **scoped** — it will unbind ⚑ markers when those exist (phase 7) and
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
