import { and, asc, eq, inArray } from "drizzle-orm"

import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignPeriod,
  campaignSlot,
  campaignSlotDungeon,
  type CampaignClockRow,
  type CampaignPeriodRow,
  type CampaignSlotRow,
} from "@/lib/db/schema/campaign-clock"
import { dungeons } from "@/lib/db/schema/dungeon"

/**
 * Reads for the campaign clock aggregate (UNN-574): the clock record, a day's
 * slot rows, and the sparse season markers. `null` clock ⇔ the DM hasn't
 * started it — the Day Runner's first-run state.
 */
export async function loadCampaignClock(
  campaignId: string,
  executor: WriteExecutor = db
): Promise<CampaignClockRow | null> {
  const [row] = await executor
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

/** A slot's dungeon claim, its dungeon resolved to display facts (D9's runner card). */
export interface LoadedClaim {
  slotId: string
  dungeonId: string
  shortId: string
  name: string
  resolvedAt: Date | null
}

/** The runner's dungeon-slot lookup: claims on any of `slotIds`, dungeon joined. */
export async function loadClaimsForSlots(
  slotIds: readonly string[]
): Promise<LoadedClaim[]> {
  if (slotIds.length === 0) return []
  return db
    .select({
      slotId: campaignSlotDungeon.slotId,
      dungeonId: campaignSlotDungeon.dungeonId,
      shortId: dungeons.shortId,
      name: dungeons.name,
      resolvedAt: campaignSlotDungeon.resolvedAt,
    })
    .from(campaignSlotDungeon)
    .innerJoin(dungeons, eq(dungeons.id, campaignSlotDungeon.dungeonId))
    .where(inArray(campaignSlotDungeon.slotId, [...slotIds]))
}

/**
 * Every period marker (both kinds), day-ascending — the loaders partition by
 * kind (`groupPeriodsByKind`) and hand each track to the view builders, which
 * scan them inherit-forward (`activePeriod`/`periodOf`).
 */
export async function loadPeriods(
  campaignId: string
): Promise<CampaignPeriodRow[]> {
  return db
    .select()
    .from(campaignPeriod)
    .where(eq(campaignPeriod.campaignId, campaignId))
    .orderBy(asc(campaignPeriod.day))
}
