import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/lib/db/client"
import {
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import {
  campaignBeat,
  type CampaignBeatRow,
} from "@/lib/db/schema/campaign-notes"
import { dungeons } from "@/lib/db/schema/dungeon"

/**
 * Read side of Session Notes (UNN-576/577): the tree, single beats, the
 * runner's beats-by-slot lookup, the floating shelf, and the schedule
 * picker's upcoming-slot enumeration. All campaign-scoped by WHERE (§5's
 * read half).
 */

/** A tree row: the beat's list facts + its schedule, slot resolved to display facts. */
export interface NotesTreeBeat {
  id: string
  folderId: string | null
  title: string
  floating: boolean
  scheduledSlot: { id: string; day: number; label: string } | null
}

/**
 * The Session Notes tree's item read (UNN-617): every beat's list facts. Its
 * folders come from the shared `loadCampaignFolders(campaignId, "session")`,
 * like the Articles and NPCs rails.
 */
export async function loadBeatsForTree(
  campaignId: string
): Promise<NotesTreeBeat[]> {
  const rows = await db
    .select({
      id: campaignBeat.id,
      folderId: campaignBeat.folderId,
      title: campaignBeat.title,
      floating: campaignBeat.floating,
      slotId: campaignSlot.id,
      slotDay: campaignSlot.day,
      slotLabel: campaignSlot.label,
    })
    .from(campaignBeat)
    .leftJoin(campaignSlot, eq(campaignSlot.id, campaignBeat.scheduledSlotId))
    .where(eq(campaignBeat.campaignId, campaignId))
    .orderBy(asc(campaignBeat.createdAt))
  return rows.map((row) => ({
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    floating: row.floating,
    scheduledSlot:
      row.slotId === null
        ? null
        : { id: row.slotId, day: row.slotDay!, label: row.slotLabel! },
  }))
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

/** One floating-shelf beat: title + defer provenance (D1's "return to Day N · ⟨slot⟩"). */
export interface FloatingBeat {
  id: string
  title: string
  /**
   * Where a defer sent it from — day/label for the return affordance, plus
   * whether that slot is meanwhile occupied again (a beat re-scheduled into
   * it, or a dungeon claim). Null for beats floated from Session Notes.
   */
  deferredFrom: {
    slotId: string
    day: number
    label: string
    occupied: boolean
  } | null
}

/**
 * The runner's **prepped shelf** (FR-5): every floating beat, newest change
 * first, each carrying its defer provenance so the menu can offer one-click
 * "Return to Day N · ⟨slot⟩" (the page gates that on `occupied` and the
 * frozen-past rule).
 */
export async function loadFloatingBeats(
  campaignId: string
): Promise<FloatingBeat[]> {
  const originSlot = alias(campaignSlot, "originSlot")
  const occupyingBeat = alias(campaignBeat, "occupyingBeat")
  const rows = await db
    .select({
      id: campaignBeat.id,
      title: campaignBeat.title,
      originSlotId: originSlot.id,
      originDay: originSlot.day,
      originLabel: originSlot.label,
      occupyingBeatId: occupyingBeat.id,
      occupyingClaimSlotId: campaignSlotDungeon.slotId,
    })
    .from(campaignBeat)
    .leftJoin(originSlot, eq(originSlot.id, campaignBeat.deferredFromSlotId))
    .leftJoin(occupyingBeat, eq(occupyingBeat.scheduledSlotId, originSlot.id))
    .leftJoin(
      campaignSlotDungeon,
      eq(campaignSlotDungeon.slotId, originSlot.id)
    )
    .where(
      and(
        eq(campaignBeat.campaignId, campaignId),
        eq(campaignBeat.floating, true)
      )
    )
    .orderBy(desc(campaignBeat.updatedAt))
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    deferredFrom:
      row.originSlotId === null
        ? null
        : {
            slotId: row.originSlotId,
            day: row.originDay!,
            label: row.originLabel!,
            occupied:
              row.occupyingBeatId !== null || row.occupyingClaimSlotId !== null,
          },
  }))
}

/** A beat the Calendar's slot picker can schedule: unscheduled or floating. */
export interface SchedulableBeat {
  id: string
  title: string
  floating: boolean
}

/**
 * The Calendar's beat-picker candidates (FR-8's "+ Schedule a beat"): every
 * beat holding no slot — the floating shelf plus the never-scheduled —
 * freshest first. (`scheduledSlotId IS NULL` covers both: the CHECK forbids
 * scheduled-and-floating.)
 */
export async function loadSchedulableBeats(
  campaignId: string
): Promise<SchedulableBeat[]> {
  return db
    .select({
      id: campaignBeat.id,
      title: campaignBeat.title,
      floating: campaignBeat.floating,
    })
    .from(campaignBeat)
    .where(
      and(
        eq(campaignBeat.campaignId, campaignId),
        isNull(campaignBeat.scheduledSlotId)
      )
    )
    .orderBy(desc(campaignBeat.updatedAt))
}

/** One schedule-picker slot: display facts + who already holds it. */
export interface UpcomingSlot {
  id: string
  day: number
  ordinal: number
  label: string
  occupiedByBeat: { id: string; title: string } | null
  /** The claiming dungeon's name, when a delve holds the slot (D9). */
  occupiedByDungeon: { name: string } | null
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
      dungeonName: dungeons.name,
    })
    .from(campaignSlot)
    .leftJoin(campaignBeat, eq(campaignBeat.scheduledSlotId, campaignSlot.id))
    .leftJoin(
      campaignSlotDungeon,
      eq(campaignSlotDungeon.slotId, campaignSlot.id)
    )
    .leftJoin(dungeons, eq(dungeons.id, campaignSlotDungeon.dungeonId))
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
    occupiedByDungeon:
      row.dungeonName === null ? null : { name: row.dungeonName },
  }))
}
