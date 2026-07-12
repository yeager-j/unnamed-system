import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db/client"
import {
  campaignClock,
  campaignSeason,
  campaignSlot,
  type CampaignClockRow,
  type CampaignSeasonRow,
  type CampaignSlotRow,
} from "@/lib/db/schema/campaign-clock"

/**
 * Reads for the campaign clock aggregate (UNN-574): the clock record, a day's
 * slot rows, and the sparse season markers. `null` clock ⇔ the DM hasn't
 * started it — the Day Runner's first-run state.
 */
export async function loadCampaignClock(
  campaignId: string
): Promise<CampaignClockRow | null> {
  const [row] = await db
    .select()
    .from(campaignClock)
    .where(eq(campaignClock.campaignId, campaignId))
  return row ?? null
}

/** A day's slots in ordinal order — the single read path for "a day's slots" (D1). */
export async function loadSlotsForDay(
  campaignId: string,
  day: number
): Promise<CampaignSlotRow[]> {
  return db
    .select()
    .from(campaignSlot)
    .where(
      and(eq(campaignSlot.campaignId, campaignId), eq(campaignSlot.day, day))
    )
    .orderBy(asc(campaignSlot.ordinal))
}

/** Every season marker, day-ascending — `seasonOf` scans them inherit-forward. */
export async function loadSeasons(
  campaignId: string
): Promise<CampaignSeasonRow[]> {
  return db
    .select()
    .from(campaignSeason)
    .where(eq(campaignSeason.campaignId, campaignId))
    .orderBy(asc(campaignSeason.day))
}
