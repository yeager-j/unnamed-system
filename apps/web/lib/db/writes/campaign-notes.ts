import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { extractChipRefs } from "@/domain/planner/chip"
import { isFrozenDay } from "@/domain/planner/clock"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import {
  campaignBeat,
  campaignBeatMention,
  type CampaignBeatRow,
} from "@/lib/db/schema/campaign-notes"

import { guardTargetFolder } from "./campaign-folders"
import { guardMany } from "./guard-many"

/**
 * Persistence for **Session Notes** (UNN-576, tech-design D6/D10): beats and
 * the derived mention index. Their folders are `kind = 'session'` rows of the
 * shared tree (UNN-617 — `writes/campaign-folders.ts`), so nothing session-
 * shaped lives here. Auth-free like every write wrapper —
 * `requireCampaignDM` lives at the Server Action boundary
 * (`lib/actions/campaign-notes/`), and every write scopes its target by
 * `(id, campaignId)` — the write-boundary rule (§5).
 *
 * Content writes are **last-write-wins** (D6: single-author prose — no
 * version token); the schedule writes carry real guards instead: **past days
 * are frozen** (D1 — a schedule write touching a slot with
 * `day < currentDay` is rejected), and one-beat-per-slot is the DB's partial
 * unique, whose violation {@link mapScheduleRaceToOccupied} maps to
 * `"slot-occupied"` (D6's race guard).
 */

/**
 * Creates a beat — titled or blank, empty tagline/body — in `folderId` or
 * Unfiled, and optionally scheduled straight into `slotId` (the runner's "New
 * story beat": mint + schedule in one transaction, through the same
 * target-slot guard as {@link scheduleBeat}). A supplied `folderId` passes the
 * shared same-campaign/same-kind folder guard (§5), so a beat can never be
 * filed into a foreign campaign's session — or an NPC folder.
 */
export async function createBeat(input: {
  campaignId: string
  folderId?: string | null
  title?: string
  slotId?: string
}): Promise<Result<{ id: string }, "folder-not-found" | ScheduleTargetError>> {
  return mapScheduleRaceToOccupied(
    guardMany(async (tx) => {
      const folder = await guardTargetFolder(
        tx,
        { campaignId: input.campaignId, folderId: input.folderId ?? null },
        "session"
      )
      if (!folder.ok) return folder
      if (input.slotId !== undefined) {
        const target = await guardScheduleTarget(
          tx,
          input.campaignId,
          input.slotId
        )
        if (!target.ok) return target
      }
      const [row] = await tx
        .insert(campaignBeat)
        .values({
          campaignId: input.campaignId,
          folderId: input.folderId ?? null,
          title: input.title ?? "",
          scheduledSlotId: input.slotId ?? null,
        })
        .returning({ id: campaignBeat.id })
      return ok(row!)
    })
  )
}

/**
 * Deletes a beat. **Blocked while scheduled to a past slot** (write map:
 * "it is history's structure") — the slot-kind derivation over history must
 * keep reading "story" for that slot. Mentions cascade with the row.
 */
export async function deleteBeat(input: {
  campaignId: string
  beatId: string
}): Promise<
  Result<void, "beat-not-found" | "clock-not-found" | "scheduled-to-past">
> {
  return guardMany(async (tx) => {
    const beat = await beatInCampaign(tx, input.campaignId, input.beatId)
    if (!beat) return err("beat-not-found")

    if (beat.scheduledSlotId !== null) {
      const frozen = await isScheduledSlotFrozen(
        tx,
        input.campaignId,
        beat.scheduledSlotId
      )
      if (!frozen.ok) return frozen
      if (frozen.value) return err("scheduled-to-past")
    }

    await tx.delete(campaignBeat).where(eq(campaignBeat.id, input.beatId))
    return ok(undefined)
  })
}

export type ScheduleTargetError =
  | "slot-not-found"
  | "clock-not-found"
  | "frozen-day"
  | "slot-occupied"

export type ScheduleBeatError = "beat-not-found" | ScheduleTargetError

/**
 * Schedules a beat into a concrete slot (clearing `floating`; consuming any
 * defer provenance — a re-scheduled beat no longer offers "return to").
 * Guards, in order: the beat exists in the campaign; its **current** slot
 * isn't frozen (moving a beat out of history is as much a rewrite as into it); the
 * target slot passes {@link guardScheduleTarget}. One-beat-per-slot is the
 * partial unique — a concurrent double-schedule loses as `"slot-occupied"`.
 */
export async function scheduleBeat(input: {
  campaignId: string
  beatId: string
  slotId: string
}): Promise<Result<void, ScheduleBeatError>> {
  return mapScheduleRaceToOccupied(
    guardMany(async (tx) => {
      const beat = await beatInCampaign(tx, input.campaignId, input.beatId)
      if (!beat) return err("beat-not-found")
      if (beat.scheduledSlotId === input.slotId) return ok(undefined)

      if (beat.scheduledSlotId !== null) {
        const frozen = await isScheduledSlotFrozen(
          tx,
          input.campaignId,
          beat.scheduledSlotId
        )
        if (!frozen.ok) return frozen
        if (frozen.value) return err("frozen-day")
      }

      const target = await guardScheduleTarget(
        tx,
        input.campaignId,
        input.slotId
      )
      if (!target.ok) return target

      await tx
        .update(campaignBeat)
        .set({
          scheduledSlotId: input.slotId,
          floating: false,
          deferredFromSlotId: null,
        })
        .where(eq(campaignBeat.id, input.beatId))
      return ok(undefined)
    })
  )
}

/**
 * The shared target-slot guard for scheduling a beat (schedule + mint-into-
 * slot): **locks the slot row** (`FOR UPDATE` — the mutual-exclusion lock the
 * dungeon-claim side also takes, D6/D9), verifies it belongs to the campaign
 * and isn't frozen, and rejects a slot already holding a dungeon claim.
 */
async function guardScheduleTarget(
  tx: WriteExecutor,
  campaignId: string,
  slotId: string
): Promise<Result<void, ScheduleTargetError>> {
  const [slot] = await tx
    .select({ day: campaignSlot.day })
    .from(campaignSlot)
    .where(
      and(eq(campaignSlot.id, slotId), eq(campaignSlot.campaignId, campaignId))
    )
    .for("update")
  if (!slot) return err("slot-not-found")

  const clock = await clockRow(tx, campaignId)
  if (!clock) return err("clock-not-found")
  if (isFrozenDay(slot.day, clock.currentDay)) return err("frozen-day")

  const [claim] = await tx
    .select({ slotId: campaignSlotDungeon.slotId })
    .from(campaignSlotDungeon)
    .where(eq(campaignSlotDungeon.slotId, slotId))
  if (claim) return err("slot-occupied")

  return ok(undefined)
}

/**
 * Clears a beat's schedule — to **floating** ("run anytime") or **not
 * scheduled**. Unscheduling out of a frozen slot is rejected (D1); flipping
 * an already-unscheduled beat between floating/none needs no guard. Any
 * defer provenance is consumed — a deliberately re-parked beat shouldn't
 * keep offering "return to Day N".
 */
export async function clearBeatSchedule(input: {
  campaignId: string
  beatId: string
  floating: boolean
}): Promise<Result<void, "beat-not-found" | "clock-not-found" | "frozen-day">> {
  return guardMany(async (tx) => {
    const beat = await beatInCampaign(tx, input.campaignId, input.beatId)
    if (!beat) return err("beat-not-found")

    if (beat.scheduledSlotId !== null) {
      const frozen = await isScheduledSlotFrozen(
        tx,
        input.campaignId,
        beat.scheduledSlotId
      )
      if (!frozen.ok) return frozen
      if (frozen.value) return err("frozen-day")
    }

    await tx
      .update(campaignBeat)
      .set({
        scheduledSlotId: null,
        floating: input.floating,
        deferredFromSlotId: null,
      })
      .where(eq(campaignBeat.id, input.beatId))
    return ok(undefined)
  })
}

/**
 * Defers a scheduled beat to the floating shelf (D1/FR-5): unschedules it,
 * floats it, records **provenance** (`deferredFromSlotId` — the shelf's
 * one-click "return to Day N · ⟨slot⟩"), and clears `resolvedAt` — a
 * deferred beat returns to prep, so the shelf never offers "pull in" on a
 * resolved scene. Frozen-past guarded like every schedule flip; one UPDATE,
 * so the `not_scheduled_and_floating` CHECK never sees an intermediate row.
 */
export async function deferBeat(input: {
  campaignId: string
  beatId: string
}): Promise<
  Result<
    void,
    "beat-not-found" | "not-scheduled" | "clock-not-found" | "frozen-day"
  >
> {
  return guardMany(async (tx) => {
    const beat = await beatInCampaign(tx, input.campaignId, input.beatId)
    if (!beat) return err("beat-not-found")
    if (beat.scheduledSlotId === null) return err("not-scheduled")

    const frozen = await isScheduledSlotFrozen(
      tx,
      input.campaignId,
      beat.scheduledSlotId
    )
    if (!frozen.ok) return frozen
    if (frozen.value) return err("frozen-day")

    await tx
      .update(campaignBeat)
      .set({
        scheduledSlotId: null,
        floating: true,
        deferredFromSlotId: beat.scheduledSlotId,
        resolvedAt: null,
      })
      .where(eq(campaignBeat.id, input.beatId))
    return ok(undefined)
  })
}

/**
 * Mark resolved / Reopen (write map §5: `resolvedAt`, LWW — one write, the
 * distinction riding the parameter).
 */
export async function setBeatResolved(input: {
  campaignId: string
  beatId: string
  resolved: boolean
}): Promise<Result<void, "beat-not-found">> {
  const updated = await db
    .update(campaignBeat)
    .set({ resolvedAt: input.resolved ? new Date() : null })
    .where(
      and(
        eq(campaignBeat.id, input.beatId),
        eq(campaignBeat.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignBeat.id })
  return updated.length === 0 ? err("beat-not-found") : ok(undefined)
}

/** The beat content fields the prose autosave may patch. */
export interface BeatProsePatch {
  title?: string
  tagline?: string
  body?: string
}

/**
 * The beat prose autosave (D10): patches content columns LWW, and when the
 * body changed, **re-derives the mention index** from its chip tokens in the
 * same transaction (delete + insert — the index is derived data, rebuildable
 * by construction).
 *
 * Deliberately no `validateParticipantRefs` here: chips arrive through the
 * campaign-scoped linker, a forged hand-typed id resolves as `missing` at
 * render (never crosses campaigns — the resolver is campaign-scoped), and
 * validating every ~800 ms autosave tick prices the wrong path.
 */
export async function saveBeatProse(input: {
  campaignId: string
  beatId: string
  patch: BeatProsePatch
}): Promise<Result<void, "beat-not-found">> {
  return guardMany(async (tx) => {
    const patched = await tx
      .update(campaignBeat)
      .set(input.patch)
      .where(
        and(
          eq(campaignBeat.id, input.beatId),
          eq(campaignBeat.campaignId, input.campaignId)
        )
      )
      .returning({ id: campaignBeat.id })
    if (patched.length === 0) return err("beat-not-found")

    if (input.patch.body !== undefined) {
      await tx
        .delete(campaignBeatMention)
        .where(eq(campaignBeatMention.beatId, input.beatId))
      const refs = extractChipRefs(input.patch.body)
      if (refs.length > 0) {
        await tx.insert(campaignBeatMention).values(
          refs.map((ref) => ({
            beatId: input.beatId,
            participantKind: ref.kind,
            participantId: ref.id,
          }))
        )
      }
    }
    return ok(undefined)
  })
}

async function beatInCampaign(
  executor: WriteExecutor,
  campaignId: string,
  beatId: string
): Promise<Pick<CampaignBeatRow, "id" | "scheduledSlotId"> | undefined> {
  const [row] = await executor
    .select({
      id: campaignBeat.id,
      scheduledSlotId: campaignBeat.scheduledSlotId,
    })
    .from(campaignBeat)
    .where(
      and(eq(campaignBeat.id, beatId), eq(campaignBeat.campaignId, campaignId))
    )
  return row
}

async function slotInCampaign(
  executor: WriteExecutor,
  campaignId: string,
  slotId: string
): Promise<{ day: number } | undefined> {
  const [row] = await executor
    .select({ day: campaignSlot.day })
    .from(campaignSlot)
    .where(
      and(eq(campaignSlot.id, slotId), eq(campaignSlot.campaignId, campaignId))
    )
  return row
}

async function clockRow(
  executor: WriteExecutor,
  campaignId: string
): Promise<{ currentDay: number } | undefined> {
  const [row] = await executor
    .select({ currentDay: campaignClock.currentDay })
    .from(campaignClock)
    .where(eq(campaignClock.campaignId, campaignId))
  return row
}

/**
 * Whether the slot a beat is currently scheduled to sits on a frozen (past)
 * day. A missing clock while a schedule exists can't happen through the app
 * (slots only exist once the clock does), so it reads as `"clock-not-found"`
 * defensively rather than guessing.
 */
async function isScheduledSlotFrozen(
  executor: WriteExecutor,
  campaignId: string,
  slotId: string
): Promise<Result<boolean, "clock-not-found">> {
  const clock = await clockRow(executor, campaignId)
  if (!clock) return err("clock-not-found")
  const slot = await slotInCampaign(executor, campaignId, slotId)
  if (!slot) return ok(false)
  return ok(isFrozenDay(slot.day, clock.currentDay))
}

/**
 * Maps the one-beat-per-slot partial unique's violation to `"slot-occupied"`
 * — the fully-concurrent double-schedule the in-transaction reads can't see
 * (the `mapSlotRaceToStale` pattern from `campaign-clock.ts`).
 */
async function mapScheduleRaceToOccupied<T, E>(
  write: Promise<Result<T, E | "slot-occupied">>
): Promise<Result<T, E | "slot-occupied">> {
  try {
    return await write
  } catch (error) {
    if (isBeatSlotUniqueViolation(error)) return err("slot-occupied")
    throw error
  }
}

function isBeatSlotUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return code === "23505" && constraint === "campaignBeat_scheduledSlot_unique"
}
