import { and, asc, eq, gte, inArray } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { campaignSlot } from "@/lib/db/schema/campaign-clock"
import {
  campaignBeat,
  campaignSession,
  type CampaignBeatRow,
  type CampaignSessionRow,
} from "@/lib/db/schema/campaign-notes"

/**
 * Read side of Session Notes (UNN-576): the tree, single beats, the runner's
 * beats-by-slot lookup, and the schedule picker's upcoming-slot enumeration.
 * All campaign-scoped by WHERE (§5's read half).
 */

/** A tree row: the beat's list facts + its schedule, slot resolved to display facts. */
export interface NotesTreeBeat {
  id: string
  sessionId: string | null
  title: string
  floating: boolean
  resolvedAt: Date | null
  scheduledSlot: { id: string; day: number; label: string } | null
}

/** The Session Notes tree read: every session + every beat's list facts. */
export async function loadNotesTree(campaignId: string): Promise<{
  sessions: CampaignSessionRow[]
  beats: NotesTreeBeat[]
}> {
  const [sessions, beats] = await Promise.all([
    db
      .select()
      .from(campaignSession)
      .where(eq(campaignSession.campaignId, campaignId))
      .orderBy(asc(campaignSession.createdAt)),
    db
      .select({
        id: campaignBeat.id,
        sessionId: campaignBeat.sessionId,
        title: campaignBeat.title,
        floating: campaignBeat.floating,
        resolvedAt: campaignBeat.resolvedAt,
        slotId: campaignSlot.id,
        slotDay: campaignSlot.day,
        slotLabel: campaignSlot.label,
      })
      .from(campaignBeat)
      .leftJoin(campaignSlot, eq(campaignSlot.id, campaignBeat.scheduledSlotId))
      .where(eq(campaignBeat.campaignId, campaignId))
      .orderBy(asc(campaignBeat.createdAt)),
  ])
  return {
    sessions,
    beats: beats.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      title: row.title,
      floating: row.floating,
      resolvedAt: row.resolvedAt,
      scheduledSlot:
        row.slotId === null
          ? null
          : { id: row.slotId, day: row.slotDay!, label: row.slotLabel! },
    })),
  }
}

/** A full beat for the editor, its schedule slot resolved to display facts. */
export interface LoadedBeat {
  beat: CampaignBeatRow
  scheduledSlot: { id: string; day: number; label: string } | null
}

/** Loads one beat (campaign-scoped) for the editor pane. */
export async function loadBeat(
  campaignId: string,
  beatId: string
): Promise<LoadedBeat | null> {
  const [row] = await db
    .select({
      beat: campaignBeat,
      slotId: campaignSlot.id,
      slotDay: campaignSlot.day,
      slotLabel: campaignSlot.label,
    })
    .from(campaignBeat)
    .leftJoin(campaignSlot, eq(campaignSlot.id, campaignBeat.scheduledSlotId))
    .where(
      and(eq(campaignBeat.id, beatId), eq(campaignBeat.campaignId, campaignId))
    )
  if (!row) return null
  return {
    beat: row.beat,
    scheduledSlot:
      row.slotId === null
        ? null
        : { id: row.slotId, day: row.slotDay!, label: row.slotLabel! },
  }
}

/** The runner's story-slot lookup: beats scheduled into any of `slotIds`. */
export async function loadBeatsForSlots(
  slotIds: readonly string[]
): Promise<CampaignBeatRow[]> {
  if (slotIds.length === 0) return []
  return db
    .select()
    .from(campaignBeat)
    .where(inArray(campaignBeat.scheduledSlotId, [...slotIds]))
}

/** One schedule-picker slot: display facts + who already holds it. */
export interface UpcomingSlot {
  id: string
  day: number
  ordinal: number
  label: string
  occupiedByBeat: { id: string; title: string } | null
}

/**
 * The schedule picker's enumeration (§2's day-picker → slot-picker): every
 * slot from `fromDay` forward, ordered `(day, ordinal)`, each carrying the
 * beat that already occupies it so the picker can disable and attribute it.
 */
export async function loadUpcomingSlots(
  campaignId: string,
  fromDay: number
): Promise<UpcomingSlot[]> {
  const rows = await db
    .select({
      id: campaignSlot.id,
      day: campaignSlot.day,
      ordinal: campaignSlot.ordinal,
      label: campaignSlot.label,
      beatId: campaignBeat.id,
      beatTitle: campaignBeat.title,
    })
    .from(campaignSlot)
    .leftJoin(campaignBeat, eq(campaignBeat.scheduledSlotId, campaignSlot.id))
    .where(
      and(
        eq(campaignSlot.campaignId, campaignId),
        gte(campaignSlot.day, fromDay)
      )
    )
    .orderBy(asc(campaignSlot.day), asc(campaignSlot.ordinal))
  return rows.map((row) => ({
    id: row.id,
    day: row.day,
    ordinal: row.ordinal,
    label: row.label,
    occupiedByBeat:
      row.beatId === null ? null : { id: row.beatId, title: row.beatTitle! },
  }))
}
