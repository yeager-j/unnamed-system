import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { extractChipRefs } from "@/domain/planner/chip"
import { isFrozenDay } from "@/domain/planner/clock"
import { db, type WriteExecutor } from "@/lib/db/client"
import { campaignClock, campaignSlot } from "@/lib/db/schema/campaign-clock"
import {
  campaignBeat,
  campaignBeatMention,
  campaignSession,
  type CampaignBeatRow,
} from "@/lib/db/schema/campaign-notes"

import { guardMany } from "./guard-many"

/**
 * Persistence for **Session Notes** (UNN-576, tech-design D6/D10): sessions,
 * beats, and the derived mention index. Auth-free like every write wrapper —
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

/** Creates a session folder. */
export async function createSession(input: {
  campaignId: string
  name: string
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(campaignSession)
    .values(input)
    .returning({ id: campaignSession.id })
  return row!
}

/** Renames a session. LWW. */
export async function renameSession(input: {
  campaignId: string
  sessionId: string
  name: string
}): Promise<Result<void, "session-not-found">> {
  const renamed = await db
    .update(campaignSession)
    .set({ name: input.name })
    .where(
      and(
        eq(campaignSession.id, input.sessionId),
        eq(campaignSession.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignSession.id })
  return renamed.length === 0 ? err("session-not-found") : ok(undefined)
}

/**
 * Deletes a session. Its beats float to the virtual **Unfiled** folder via
 * the `sessionId` FK's SET NULL — no compensating write, no magic row.
 */
export async function deleteSession(input: {
  campaignId: string
  sessionId: string
}): Promise<Result<void, "session-not-found">> {
  const deleted = await db
    .delete(campaignSession)
    .where(
      and(
        eq(campaignSession.id, input.sessionId),
        eq(campaignSession.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignSession.id })
  return deleted.length === 0 ? err("session-not-found") : ok(undefined)
}

/**
 * Creates a beat — empty title/tagline/body, unscheduled — in `sessionId` or
 * Unfiled. A supplied `sessionId` is validated against the gated campaign
 * (§5) so a beat can never be filed into a foreign campaign's session.
 */
export async function createBeat(input: {
  campaignId: string
  sessionId?: string | null
}): Promise<Result<{ id: string }, "session-not-found">> {
  return guardMany(async (tx) => {
    if (input.sessionId != null) {
      const found = await sessionInCampaign(
        tx,
        input.campaignId,
        input.sessionId
      )
      if (!found) return err("session-not-found")
    }
    const [row] = await tx
      .insert(campaignBeat)
      .values({
        campaignId: input.campaignId,
        sessionId: input.sessionId ?? null,
      })
      .returning({ id: campaignBeat.id })
    return ok(row!)
  })
}

/** Moves a beat between sessions (null ⇒ Unfiled). Organizational only — never touches the schedule. */
export async function moveBeatToSession(input: {
  campaignId: string
  beatId: string
  sessionId: string | null
}): Promise<Result<void, "beat-not-found" | "session-not-found">> {
  return guardMany(async (tx) => {
    if (input.sessionId != null) {
      const found = await sessionInCampaign(
        tx,
        input.campaignId,
        input.sessionId
      )
      if (!found) return err("session-not-found")
    }
    const moved = await tx
      .update(campaignBeat)
      .set({ sessionId: input.sessionId })
      .where(
        and(
          eq(campaignBeat.id, input.beatId),
          eq(campaignBeat.campaignId, input.campaignId)
        )
      )
      .returning({ id: campaignBeat.id })
    if (moved.length === 0) return err("beat-not-found")
    return ok(undefined)
  })
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

export type ScheduleBeatError =
  | "beat-not-found"
  | "slot-not-found"
  | "clock-not-found"
  | "frozen-day"
  | "slot-occupied"

/**
 * Schedules a beat into a concrete slot (clearing `floating`). Guards, in
 * order: the beat exists in the campaign; its **current** slot isn't frozen
 * (moving a beat out of history is as much a rewrite as into it); the target
 * slot exists in the campaign and isn't frozen. One-beat-per-slot is the
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

      const clock = await clockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      const slot = await slotInCampaign(tx, input.campaignId, input.slotId)
      if (!slot) return err("slot-not-found")
      if (isFrozenDay(slot.day, clock.currentDay)) return err("frozen-day")

      await tx
        .update(campaignBeat)
        .set({ scheduledSlotId: input.slotId, floating: false })
        .where(eq(campaignBeat.id, input.beatId))
      return ok(undefined)
    })
  )
}

/**
 * Clears a beat's schedule — to **floating** ("run anytime") or **not
 * scheduled**. Unscheduling out of a frozen slot is rejected (D1); flipping
 * an already-unscheduled beat between floating/none needs no guard.
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
      .set({ scheduledSlotId: null, floating: input.floating })
      .where(eq(campaignBeat.id, input.beatId))
    return ok(undefined)
  })
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

async function sessionInCampaign(
  executor: WriteExecutor,
  campaignId: string,
  sessionId: string
): Promise<boolean> {
  const [row] = await executor
    .select({ id: campaignSession.id })
    .from(campaignSession)
    .where(
      and(
        eq(campaignSession.id, sessionId),
        eq(campaignSession.campaignId, campaignId)
      )
    )
  return row !== undefined
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
