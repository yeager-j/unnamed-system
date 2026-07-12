import { and, eq, inArray, max, sql } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { isFrozenDay } from "@/domain/planner/clock"
import {
  daysInInterval,
  planSlotMaterialization,
  type PlannedSlotRow,
} from "@/domain/planner/materialize-slots"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignSeason,
  campaignSlot,
  type CampaignClockRow,
  type SlotTemplateEntry,
} from "@/lib/db/schema/campaign-clock"

import { guardMany } from "./guard-many"

/**
 * Persistence for the campaign clock aggregate (UNN-574, tech-design D1/D6) —
 * the clock record, its semi-materialized slot rows, and the sparse season
 * markers. Auth-free like every write wrapper; `requireCampaignDM` lives at the
 * Server Action boundary.
 *
 * Every **clock-structural** write (advance / un-advance / add-days / per-day
 * slot edits / template edit) runs under the `clockVersion` guarded
 * compare-and-bump, and the multi-statement ones compose reads + slot inserts
 * + the CAS into **one transaction with the CAS last** (D6): a two-tab
 * double-advance's loser must not leave materialized slot rows beyond
 * `currentDay`. The `UNIQUE (campaignId, day, ordinal)` constraint is the
 * backstop for the fully-concurrent interleaving the CAS pre-check can't see —
 * {@link isSlotUniqueViolation} maps that violation to the same `"stale"` the
 * CAS loser gets. Season set/clear is last-write-wins (no token — annoying,
 * not corrupting).
 */

export type ClockWriteError = "clock-not-found" | "stale"

/** The post-write clock coordinates every guarded mutation returns. */
export type ClockWriteSuccess = { currentDay: number; clockVersion: number }

/**
 * Mints the clock (the explicit "Start the clock" action, D10) at
 * `startingDay` — a DM adopting a mid-flight campaign starts at day 40 — and
 * materializes that day's slots from the template in the same transaction.
 * Insert-once: the `campaignId` PK makes a second start a conflict, surfaced
 * as `"clock-exists"` with nothing written.
 */
export async function startClock(input: {
  campaignId: string
  startingDay: number
  slotTemplate: SlotTemplateEntry[]
}): Promise<Result<ClockWriteSuccess, "clock-exists">> {
  return guardMany(async (tx) => {
    const inserted = await tx
      .insert(campaignClock)
      .values({
        campaignId: input.campaignId,
        currentDay: input.startingDay,
        slotTemplate: input.slotTemplate,
      })
      .onConflictDoNothing()
      .returning({
        currentDay: campaignClock.currentDay,
        clockVersion: campaignClock.clockVersion,
      })
    if (inserted.length === 0) return err("clock-exists")

    await insertSlotRows(
      tx,
      input.campaignId,
      planSlotMaterialization(
        input.slotTemplate,
        [input.startingDay],
        new Set()
      )
    )
    return ok(inserted[0]!)
  })
}

/**
 * Advances the clock by `days` (1 = plain advance, N = time-skip) — D1's
 * materialization rule in one transaction: every day in
 * `(currentDay, currentDay + days]` that has no slots gets template rows, then
 * the CAS moves `currentDay` and bumps `clockVersion` **last**. The loser of a
 * double-advance rolls its slot inserts back and returns `"stale"`.
 *
 * The advance **gate** (block while any unresolved deadline ≤ newDay exists,
 * D1/D5) is stubbed until dated Articles land (phase 5); it slots in before
 * the materialization, inside this transaction.
 */
export async function advanceClock(input: {
  campaignId: string
  days: number
  expectedVersion: number
}): Promise<Result<ClockWriteSuccess, ClockWriteError>> {
  return mapSlotRaceToStale(
    guardMany(async (tx) => {
      const clock = await loadClockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      if (clock.clockVersion !== input.expectedVersion) return err("stale")

      const newDay = clock.currentDay + input.days
      const window = daysInInterval(clock.currentDay, newDay)
      const materialized = await daysWithSlots(tx, input.campaignId, window)
      await insertSlotRows(
        tx,
        input.campaignId,
        planSlotMaterialization(clock.slotTemplate, window, materialized)
      )

      return casClock(tx, input.campaignId, input.expectedVersion, {
        currentDay: newDay,
      })
    })
  )
}

/**
 * Un-advance: `currentDay -= 1`, strictly one day at a time and **scoped**
 * (D1) — phase 7 adds the ⚑-marker unbind here; it never reverses day-end
 * bulk beat mutations. `"at-floor"` covers both floors: day 1, and the
 * earliest materialized day (a mid-flight clock started at day 40 can't back
 * into day 39 — no slots were ever minted there, and you can never stand on a
 * day without slots).
 */
export async function unAdvanceClock(input: {
  campaignId: string
  expectedVersion: number
}): Promise<Result<ClockWriteSuccess, ClockWriteError | "at-floor">> {
  return guardMany(async (tx) => {
    const clock = await loadClockRow(tx, input.campaignId)
    if (!clock) return err("clock-not-found")
    if (clock.clockVersion !== input.expectedVersion) return err("stale")

    const newDay = clock.currentDay - 1
    if (newDay < 1) return err("at-floor")
    const materialized = await daysWithSlots(tx, input.campaignId, [newDay])
    if (!materialized.has(newDay)) return err("at-floor")

    return casClock(tx, input.campaignId, input.expectedVersion, {
      currentDay: newDay,
    })
  })
}

/**
 * Add-days (Calendar): extends the horizon by materializing template slots for
 * `(horizon, horizon + days]` without touching `currentDay`. The horizon is
 * derived (`max(day)`, never stored); an empty slot set can't happen once the
 * clock exists, but the clock's own `currentDay` is the defensive fallback.
 */
export async function addDays(input: {
  campaignId: string
  days: number
  expectedVersion: number
}): Promise<Result<ClockWriteSuccess, ClockWriteError>> {
  return mapSlotRaceToStale(
    guardMany(async (tx) => {
      const clock = await loadClockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      if (clock.clockVersion !== input.expectedVersion) return err("stale")

      const [row] = await tx
        .select({ horizon: max(campaignSlot.day) })
        .from(campaignSlot)
        .where(eq(campaignSlot.campaignId, input.campaignId))
      const from = row?.horizon ?? clock.currentDay
      await insertSlotRows(
        tx,
        input.campaignId,
        planSlotMaterialization(
          clock.slotTemplate,
          daysInInterval(from, from + input.days),
          new Set()
        )
      )

      return casClock(tx, input.campaignId, input.expectedVersion, {})
    })
  )
}

/**
 * Per-day "+ Add slot" (Day Runner / Calendar): appends a slot after the day's
 * last ordinal. The day must already be materialized (`"day-not-materialized"`
 * otherwise — the affordance only renders on existing days) and not frozen
 * (`day < currentDay` is history — D1).
 */
export async function addSlot(input: {
  campaignId: string
  day: number
  label: string
  expectedVersion: number
}): Promise<
  Result<
    ClockWriteSuccess,
    ClockWriteError | "frozen-day" | "day-not-materialized"
  >
> {
  return mapSlotRaceToStale(
    guardMany(async (tx) => {
      const clock = await loadClockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      if (clock.clockVersion !== input.expectedVersion) return err("stale")
      if (isFrozenDay(input.day, clock.currentDay)) return err("frozen-day")

      const [row] = await tx
        .select({ lastOrdinal: max(campaignSlot.ordinal) })
        .from(campaignSlot)
        .where(
          and(
            eq(campaignSlot.campaignId, input.campaignId),
            eq(campaignSlot.day, input.day)
          )
        )
      if (row?.lastOrdinal == null) return err("day-not-materialized")

      await insertSlotRows(tx, input.campaignId, [
        { day: input.day, ordinal: row.lastOrdinal + 1, label: input.label },
      ])

      return casClock(tx, input.campaignId, input.expectedVersion, {})
    })
  )
}

/**
 * Renames a slot in place (`day` is immutable — slots are created, renamed,
 * and deleted, never moved). Campaign-scoped by the boundary rule (§5): a
 * `slotId` belonging to another campaign reads as `"slot-not-found"`. Frozen
 * for past days — renaming would rewrite what history displays.
 */
export async function renameSlot(input: {
  campaignId: string
  slotId: string
  label: string
  expectedVersion: number
}): Promise<
  Result<ClockWriteSuccess, ClockWriteError | "frozen-day" | "slot-not-found">
> {
  return guardMany(async (tx) => {
    const clock = await loadClockRow(tx, input.campaignId)
    if (!clock) return err("clock-not-found")
    if (clock.clockVersion !== input.expectedVersion) return err("stale")

    const [slot] = await tx
      .select({ day: campaignSlot.day })
      .from(campaignSlot)
      .where(
        and(
          eq(campaignSlot.id, input.slotId),
          eq(campaignSlot.campaignId, input.campaignId)
        )
      )
    if (!slot) return err("slot-not-found")
    if (isFrozenDay(slot.day, clock.currentDay)) return err("frozen-day")

    await tx
      .update(campaignSlot)
      .set({ label: input.label })
      .where(eq(campaignSlot.id, input.slotId))

    return casClock(tx, input.campaignId, input.expectedVersion, {})
  })
}

/**
 * Template edit (Manage Campaign → "Day structure"). Forward-only by
 * construction: the template is only read at materialization time, so already
 * materialized days keep their rows untouched. Minimum one entry is
 * CHECK-enforced; the action's schema validates it first.
 */
export async function setSlotTemplate(input: {
  campaignId: string
  slotTemplate: SlotTemplateEntry[]
  expectedVersion: number
}): Promise<Result<ClockWriteSuccess, ClockWriteError>> {
  return guardMany(async (tx) => {
    const clock = await loadClockRow(tx, input.campaignId)
    if (!clock) return err("clock-not-found")

    return casClock(tx, input.campaignId, input.expectedVersion, {
      slotTemplate: input.slotTemplate,
    })
  })
}

/**
 * Sets (or relabels) the season starting on `day` — a sparse inherit-forward
 * marker keyed `(campaignId, day)`. Last-write-wins per D6: single-author
 * flavor text, no version token.
 */
export async function setSeason(input: {
  campaignId: string
  day: number
  label: string
}): Promise<void> {
  await db
    .insert(campaignSeason)
    .values(input)
    .onConflictDoUpdate({
      target: [campaignSeason.campaignId, campaignSeason.day],
      set: { label: input.label },
    })
}

/** Clears the season marker on `day` (the days it covered inherit the previous marker). LWW. */
export async function clearSeason(input: {
  campaignId: string
  day: number
}): Promise<void> {
  await db
    .delete(campaignSeason)
    .where(
      and(
        eq(campaignSeason.campaignId, input.campaignId),
        eq(campaignSeason.day, input.day)
      )
    )
}

/** The clock row read every guarded write starts from, inside its transaction. */
async function loadClockRow(
  executor: WriteExecutor,
  campaignId: string
): Promise<CampaignClockRow | undefined> {
  const [row] = await executor
    .select()
    .from(campaignClock)
    .where(eq(campaignClock.campaignId, campaignId))
  return row
}

/** Which of `days` already hold slot rows (feeds {@link planSlotMaterialization}). */
async function daysWithSlots(
  executor: WriteExecutor,
  campaignId: string,
  days: readonly number[]
): Promise<Set<number>> {
  if (days.length === 0) return new Set()
  const rows = await executor
    .selectDistinct({ day: campaignSlot.day })
    .from(campaignSlot)
    .where(
      and(
        eq(campaignSlot.campaignId, campaignId),
        inArray(campaignSlot.day, [...days])
      )
    )
  return new Set(rows.map((row) => row.day))
}

/** Bulk-inserts planned slot rows for a campaign (no-op on an empty plan). */
async function insertSlotRows(
  executor: WriteExecutor,
  campaignId: string,
  planned: PlannedSlotRow[]
): Promise<void> {
  if (planned.length === 0) return
  await executor
    .insert(campaignSlot)
    .values(planned.map((slot) => ({ campaignId, ...slot })))
}

/**
 * The guarded compare-and-bump, always the transaction's **last** statement
 * (D6): applies `patch` + `clockVersion + 1` in one `SET`, conditioned on
 * `(campaignId, clockVersion === expectedVersion)`. Zero rows ⇒ `"stale"` —
 * the caller already proved the row exists this transaction.
 */
async function casClock(
  executor: WriteExecutor,
  campaignId: string,
  expectedVersion: number,
  patch: Partial<typeof campaignClock.$inferInsert>
): Promise<Result<ClockWriteSuccess, ClockWriteError>> {
  const updated = await executor
    .update(campaignClock)
    .set({ ...patch, clockVersion: sql`${campaignClock.clockVersion} + 1` })
    .where(
      and(
        eq(campaignClock.campaignId, campaignId),
        eq(campaignClock.clockVersion, expectedVersion)
      )
    )
    .returning({
      currentDay: campaignClock.currentDay,
      clockVersion: campaignClock.clockVersion,
    })

  if (updated.length === 0) return err("stale")
  return ok(updated[0]!)
}

/**
 * Maps the `UNIQUE (campaignId, day, ordinal)` violation to `"stale"`: two
 * fully-concurrent materializing writes can both pass the version pre-check,
 * and the second's slot insert then trips the constraint once the first
 * commits — the same lost race the CAS catches in the sequential interleaving,
 * so it gets the same verdict (and the constraint guarantees no duplicate slot
 * rows either way).
 */
async function mapSlotRaceToStale<T, E>(
  write: Promise<Result<T, E | "stale">>
): Promise<Result<T, E | "stale">> {
  try {
    return await write
  } catch (error) {
    if (isSlotUniqueViolation(error)) return err("stale")
    throw error
  }
}

function isSlotUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return (
    code === "23505" &&
    constraint === "campaignSlot_campaign_day_ordinal_unique"
  )
}
