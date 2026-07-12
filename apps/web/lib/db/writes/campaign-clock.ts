import { and, eq, inArray, isNull, max, sql } from "drizzle-orm"

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
  campaignSlotDungeon,
  type CampaignClockRow,
  type SlotTemplateEntry,
} from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import { entity } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"

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

/** "End the day"'s three paths: the ready advance + the warning's two proceed modes (PRD FR-5). */
export type EndDayMode = "advance" | "resolve-all" | "defer-unresolved"

/**
 * "End the day" (UNN-577, PRD FR-5), one transaction for all three modes —
 * the bulk modes are the §0 exception where stored beat/claim facts are
 * written in bulk, which is why un-advance is *scoped*, not compensating.
 *
 * - **advance** (the ready path): asserts the day is genuinely complete —
 *   no unresolved beat/claim, no missing downtime entry — and refuses with
 *   `"not-ready"` otherwise, writing nothing. The client's readiness cue is
 *   advisory: beat resolve/reopen and activity edits don't bump
 *   `clockVersion`, so a stale tab can render "ready" over loose ends; this
 *   in-transaction recount is what actually decides, and a refusal sends the
 *   DM back to the warning rather than silently resolving or deferring work
 *   they never saw.
 * - **resolve-all** ("it all happened, I just didn't tick"): stamps
 *   `resolvedAt` on today's unresolved beats and dungeon claims.
 * - **defer-unresolved** ("we didn't get to those scenes"): floats unresolved
 *   beats with provenance (`deferredFromSlotId`, one statement so the
 *   `not_scheduled_and_floating` CHECK never sees an intermediate row) and
 *   **deletes** unresolved claims (the delve didn't happen; the dungeon list
 *   keeps the dungeon).
 *
 * The bulk modes then **bulk-fill Idle** for every (downtime slot × placed
 * character) missing an entry — with "downtime" evaluated *after* the mode
 * mutations, so slots a defer just freed are filled honestly too. The roster
 * read mirrors `loadPlacedCharactersForCampaign` (finalized + placed +
 * `deletedAt IS NULL`) — the raw subtype would fill for tombstones. The fill
 * inserts `ON CONFLICT DO NOTHING` against the `(slotId, primaryId)` partial
 * unique: a concurrent `recordActivity` wins either way.
 *
 * Today's slot rows are locked `FOR UPDATE` up front — the same
 * mutual-exclusion lock the claim/schedule writes take — so a claim or
 * schedule can't slip onto a slot mid-gesture and get stranded on what is
 * about to become a frozen day. Materialize-tomorrow + the `clockVersion`
 * CAS run **last**: a stale loser rolls back every bulk mutation.
 */
export async function endDay(input: {
  campaignId: string
  mode: EndDayMode
  expectedVersion: number
}): Promise<Result<ClockWriteSuccess, ClockWriteError | "not-ready">> {
  return mapSlotRaceToStale(
    guardMany(async (tx) => {
      const clock = await loadClockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      if (clock.clockVersion !== input.expectedVersion) return err("stale")

      const todaySlots = await tx
        .select({ id: campaignSlot.id })
        .from(campaignSlot)
        .where(
          and(
            eq(campaignSlot.campaignId, input.campaignId),
            eq(campaignSlot.day, clock.currentDay)
          )
        )
        .for("update")
      const slotIds = todaySlots.map((slot) => slot.id)

      const beats =
        slotIds.length === 0
          ? []
          : await tx
              .select({
                id: campaignBeat.id,
                scheduledSlotId: campaignBeat.scheduledSlotId,
                resolvedAt: campaignBeat.resolvedAt,
              })
              .from(campaignBeat)
              .where(inArray(campaignBeat.scheduledSlotId, slotIds))
      const claims =
        slotIds.length === 0
          ? []
          : await tx
              .select({
                slotId: campaignSlotDungeon.slotId,
                resolvedAt: campaignSlotDungeon.resolvedAt,
              })
              .from(campaignSlotDungeon)
              .where(inArray(campaignSlotDungeon.slotId, slotIds))

      const unresolvedBeatIds = beats
        .filter((beat) => beat.resolvedAt === null)
        .map((beat) => beat.id)
      const unresolvedClaimSlotIds = claims
        .filter((claim) => claim.resolvedAt === null)
        .map((claim) => claim.slotId)

      if (input.mode === "advance") {
        if (unresolvedBeatIds.length > 0 || unresolvedClaimSlotIds.length > 0) {
          return err("not-ready")
        }
      } else if (input.mode === "resolve-all") {
        const stamp = new Date()
        if (unresolvedBeatIds.length > 0) {
          await tx
            .update(campaignBeat)
            .set({ resolvedAt: stamp })
            .where(inArray(campaignBeat.id, unresolvedBeatIds))
        }
        if (unresolvedClaimSlotIds.length > 0) {
          await tx
            .update(campaignSlotDungeon)
            .set({ resolvedAt: stamp })
            .where(inArray(campaignSlotDungeon.slotId, unresolvedClaimSlotIds))
        }
      } else {
        if (unresolvedBeatIds.length > 0) {
          await tx
            .update(campaignBeat)
            .set({
              scheduledSlotId: null,
              floating: true,
              deferredFromSlotId: sql`${campaignBeat.scheduledSlotId}`,
              resolvedAt: null,
            })
            .where(inArray(campaignBeat.id, unresolvedBeatIds))
        }
        if (unresolvedClaimSlotIds.length > 0) {
          await tx
            .delete(campaignSlotDungeon)
            .where(inArray(campaignSlotDungeon.slotId, unresolvedClaimSlotIds))
        }
      }

      const keptBeats =
        input.mode === "defer-unresolved"
          ? beats.filter((beat) => beat.resolvedAt !== null)
          : beats
      const keptClaims =
        input.mode === "defer-unresolved"
          ? claims.filter((claim) => claim.resolvedAt !== null)
          : claims
      const occupied = new Set([
        ...keptBeats.map((beat) => beat.scheduledSlotId),
        ...keptClaims.map((claim) => claim.slotId),
      ])
      const downtimeSlotIds = slotIds.filter((id) => !occupied.has(id))

      const fills = await computeIdleFills(
        tx,
        input.campaignId,
        clock.currentDay,
        downtimeSlotIds
      )
      if (input.mode === "advance") {
        if (fills.length > 0) return err("not-ready")
      } else if (fills.length > 0) {
        await tx.insert(campaignUpdate).values(fills).onConflictDoNothing()
      }

      const newDay = clock.currentDay + 1
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
 * The Idle bulk-fill rows (D9/FR-2): one empty-bodied `idle` entry per
 * missing (downtime slot × placed character) pair. The bulk modes insert
 * them (explicit DM consent via the day-end warning, recorded honestly so
 * the readiness cue completes); the `advance` mode treats a non-empty result
 * as `"not-ready"` — the same computation is the server-side readiness
 * recount.
 */
async function computeIdleFills(
  tx: WriteExecutor,
  campaignId: string,
  day: number,
  downtimeSlotIds: readonly string[]
): Promise<(typeof campaignUpdate.$inferInsert)[]> {
  if (downtimeSlotIds.length === 0) return []

  const roster = await tx
    .select({ characterId: playerCharacter.entityId })
    .from(playerCharacter)
    .innerJoin(entity, eq(playerCharacter.entityId, entity.id))
    .where(
      and(
        eq(playerCharacter.campaignId, campaignId),
        eq(playerCharacter.status, "finalized"),
        isNull(entity.deletedAt)
      )
    )
  if (roster.length === 0) return []

  const existing = await tx
    .select({
      slotId: campaignUpdate.slotId,
      primaryId: campaignUpdate.primaryId,
    })
    .from(campaignUpdate)
    .where(inArray(campaignUpdate.slotId, [...downtimeSlotIds]))
  const recorded = new Set(
    existing.map((row) => `${row.slotId}:${row.primaryId}`)
  )

  return downtimeSlotIds.flatMap((slotId) =>
    roster
      .filter(({ characterId }) => !recorded.has(`${slotId}:${characterId}`))
      .map(({ characterId }) => ({
        campaignId,
        day,
        primaryKind: "character" as const,
        primaryId: characterId,
        body: "",
        category: "idle" as const,
        slotId,
      }))
  )
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
