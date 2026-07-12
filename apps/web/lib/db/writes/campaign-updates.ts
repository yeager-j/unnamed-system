import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type { ParticipantRef } from "@/domain/planner/participant"
import { type WriteExecutor } from "@/lib/db/client"
import { campaignClock, campaignSlot } from "@/lib/db/schema/campaign-clock"
import {
  campaignUpdate,
  campaignUpdateConcern,
  type UpdateCategory,
} from "@/lib/db/schema/campaign-updates"

import { guardMany } from "./guard-many"

/**
 * Persistence for the **update stream** (UNN-576, tech-design D3): a downtime
 * activity IS a `campaignUpdate` row carrying the downtime facet
 * (`slotId` + `category`). Auth-free like every write wrapper; every target
 * scopes by `(id, campaignId)` (§5), and `day` is **server-derived from the
 * slot at write time** — never the wire's — which the slot's immutable `day`
 * makes safe (D1).
 *
 * The one recording guard with teeth: **`slot.day` must equal the clock's
 * `currentDay`** — recording is a present-tense act, and the check neutralizes
 * stale tabs left open across an advance/un-advance (D1). One entry per
 * character per slot is the DB's partial unique; the primary insert maps its
 * violation to `"already-recorded"`, and the copy fan-out's inserts skip
 * conflicts instead (a copy to an already-recorded character is a no-op,
 * reported in the success value). Bodies are LWW (D6).
 */

export type RecordActivityError =
  | "clock-not-found"
  | "slot-not-found"
  | "not-current-day"
  | "already-recorded"

export interface RecordActivitySuccess {
  updateId: string
  /** Copy-fan-out targets skipped because they already recorded this slot. */
  skippedCharacterIds: string[]
}

export async function recordActivity(input: {
  campaignId: string
  slotId: string
  characterId: string
  body: string
  category: UpdateCategory
  concerns: readonly Pick<ParticipantRef, "kind" | "id">[]
  /** "Copy this entry to other characters…" — each gets its own row (D3). */
  alsoCharacterIds: readonly string[]
}): Promise<Result<RecordActivitySuccess, RecordActivityError>> {
  return mapRecordRaceToAlreadyRecorded(
    guardMany(async (tx) => {
      const day = await currentDaySlot(tx, input.campaignId, input.slotId)
      if (!day.ok) return day

      const [primary] = await tx
        .insert(campaignUpdate)
        .values({
          campaignId: input.campaignId,
          day: day.value,
          primaryKind: "character",
          primaryId: input.characterId,
          body: input.body,
          category: input.category,
          slotId: input.slotId,
        })
        .returning({ id: campaignUpdate.id })
      await insertConcerns(tx, primary!.id, input.concerns)

      const copyTargets = [...new Set(input.alsoCharacterIds)].filter(
        (id) => id !== input.characterId
      )
      const skipped: string[] = []
      for (const characterId of copyTargets) {
        const [copy] = await tx
          .insert(campaignUpdate)
          .values({
            campaignId: input.campaignId,
            day: day.value,
            primaryKind: "character",
            primaryId: characterId,
            body: input.body,
            category: input.category,
            slotId: input.slotId,
          })
          .onConflictDoNothing()
          .returning({ id: campaignUpdate.id })
        if (copy === undefined) {
          skipped.push(characterId)
          continue
        }
        await insertConcerns(tx, copy.id, input.concerns)
      }

      return ok({ updateId: primary!.id, skippedCharacterIds: skipped })
    })
  )
}

export type EditActivityError =
  | "update-not-found"
  | "clock-not-found"
  | "not-current-day"

/**
 * Edits a recorded activity in place — the same row the Chronicle will show
 * (D3: nothing moves, nothing syncs). Body/category LWW; concerns replaced
 * wholesale. Slotted rows keep the current-day guard (the slot's day is the
 * row's day); re-dating is out of scope here — it is defined as *detaching*
 * (write map), a Chronicle-side affordance.
 */
export async function editActivity(input: {
  campaignId: string
  updateId: string
  body: string
  category: UpdateCategory
  concerns: readonly Pick<ParticipantRef, "kind" | "id">[]
}): Promise<Result<void, EditActivityError>> {
  return guardMany(async (tx) => {
    const row = await updateInCampaign(tx, input.campaignId, input.updateId)
    if (!row) return err("update-not-found")
    if (row.slotId !== null) {
      const day = await currentDaySlot(tx, input.campaignId, row.slotId)
      if (!day.ok) {
        return err(
          day.error === "slot-not-found" ? "update-not-found" : day.error
        )
      }
    }

    await tx
      .update(campaignUpdate)
      .set({ body: input.body, category: input.category })
      .where(eq(campaignUpdate.id, input.updateId))
    await tx
      .delete(campaignUpdateConcern)
      .where(eq(campaignUpdateConcern.updateId, input.updateId))
    await insertConcerns(tx, input.updateId, input.concerns)
    return ok(undefined)
  })
}

/** Deletes a recorded activity (concerns cascade). Same current-day guard as {@link editActivity}. */
export async function deleteActivity(input: {
  campaignId: string
  updateId: string
}): Promise<Result<void, EditActivityError>> {
  return guardMany(async (tx) => {
    const row = await updateInCampaign(tx, input.campaignId, input.updateId)
    if (!row) return err("update-not-found")
    if (row.slotId !== null) {
      const day = await currentDaySlot(tx, input.campaignId, row.slotId)
      if (!day.ok) {
        return err(
          day.error === "slot-not-found" ? "update-not-found" : day.error
        )
      }
    }

    await tx.delete(campaignUpdate).where(eq(campaignUpdate.id, input.updateId))
    return ok(undefined)
  })
}

/**
 * Resolves the slot (campaign-scoped) and asserts it sits on the clock's
 * current day — the recording guard. Returns the slot's `day`, the value the
 * update row denormalizes.
 */
async function currentDaySlot(
  executor: WriteExecutor,
  campaignId: string,
  slotId: string
): Promise<
  Result<number, "clock-not-found" | "slot-not-found" | "not-current-day">
> {
  const [clock] = await executor
    .select({ currentDay: campaignClock.currentDay })
    .from(campaignClock)
    .where(eq(campaignClock.campaignId, campaignId))
  if (!clock) return err("clock-not-found")

  const [slot] = await executor
    .select({ day: campaignSlot.day })
    .from(campaignSlot)
    .where(
      and(eq(campaignSlot.id, slotId), eq(campaignSlot.campaignId, campaignId))
    )
  if (!slot) return err("slot-not-found")
  if (slot.day !== clock.currentDay) return err("not-current-day")
  return ok(slot.day)
}

async function updateInCampaign(
  executor: WriteExecutor,
  campaignId: string,
  updateId: string
): Promise<{ id: string; slotId: string | null } | undefined> {
  const [row] = await executor
    .select({ id: campaignUpdate.id, slotId: campaignUpdate.slotId })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.id, updateId),
        eq(campaignUpdate.campaignId, campaignId)
      )
    )
  return row
}

async function insertConcerns(
  executor: WriteExecutor,
  updateId: string,
  concerns: readonly Pick<ParticipantRef, "kind" | "id">[]
): Promise<void> {
  if (concerns.length === 0) return
  await executor.insert(campaignUpdateConcern).values(
    concerns.map((ref) => ({
      updateId,
      participantKind: ref.kind,
      participantId: ref.id,
    }))
  )
}

/**
 * Maps the `(slotId, primaryId)` partial unique's violation on the *primary*
 * insert to `"already-recorded"` — the concurrent double-record the
 * in-transaction reads can't see (the `mapSlotRaceToStale` pattern). Copy
 * inserts never throw it: they ride `onConflictDoNothing`.
 */
async function mapRecordRaceToAlreadyRecorded<T, E>(
  write: Promise<Result<T, E | "already-recorded">>
): Promise<Result<T, E | "already-recorded">> {
  try {
    return await write
  } catch (error) {
    if (isSlotPrimaryUniqueViolation(error)) return err("already-recorded")
    throw error
  }
}

function isSlotPrimaryUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return code === "23505" && constraint === "campaignUpdate_slot_primary_unique"
}
