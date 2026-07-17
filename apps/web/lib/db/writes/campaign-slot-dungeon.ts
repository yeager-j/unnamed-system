import { and, eq, isNull } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/result"

import { isFrozenDay } from "@/domain/planner/clock"
import { type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { dungeons } from "@/lib/db/schema/dungeon"

import { guardMany } from "./guard-many"

/**
 * Persistence for **dungeon slot claims** (UNN-577, tech-design D9): the
 * mirror of how beats claim slots. Auth-free like every write wrapper —
 * `requireCampaignDM` lives at the Server Action boundary — and every write
 * scopes its targets by the gated campaign (§5's boundary rule; the claim
 * table has no `campaignId`, so scoping rides the slot/dungeon joins).
 *
 * Claiming takes a **`FOR UPDATE` lock on the slot row** before the
 * cross-table beat check: beat-schedule vs dungeon-claim are check-then-write
 * against *different* tables, so under READ COMMITTED both could pass their
 * checks and commit — corrupting the slot-kind derivation the whole feature
 * hangs on (D6: guard where a race corrupts structure). `scheduleBeat` takes
 * the same lock from its side. The claim table's `slotId` PK backstops the
 * same-table race, mapped to `"slot-occupied"` like the beat side's partial
 * unique.
 *
 * Past days are frozen (D1) for claim/unclaim — history keeps its shape;
 * resolve/reopen stays LWW like a beat's `resolvedAt` (write map §5).
 */

export type ClaimDungeonSlotError =
  | "clock-not-found"
  | "slot-not-found"
  | "dungeon-not-found"
  | "frozen-day"
  | "slot-occupied"

/**
 * Claims `slotId` for `dungeonId` — the slot's kind becomes dungeon. A claim is
 * a **new reference**, so an archived (`deletedAt`) dungeon is rejected as
 * `dungeon-not-found` (the tombstone-family rule — no new ref points at a
 * tombstone; UNN-616).
 */
export async function claimDungeonSlot(input: {
  campaignId: string
  slotId: string
  dungeonId: string
}): Promise<Result<void, ClaimDungeonSlotError>> {
  return mapClaimRaceToOccupied(
    guardMany(async (tx) => {
      const slot = await lockSlotInCampaign(tx, input.campaignId, input.slotId)
      if (!slot) return err("slot-not-found")

      const clock = await clockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")
      if (isFrozenDay(slot.day, clock.currentDay)) return err("frozen-day")

      const [dungeon] = await tx
        .select({ id: dungeons.id })
        .from(dungeons)
        .where(
          and(
            eq(dungeons.id, input.dungeonId),
            eq(dungeons.campaignId, input.campaignId),
            isNull(dungeons.deletedAt)
          )
        )
      if (!dungeon) return err("dungeon-not-found")

      const beatHolds = await slotHoldsBeat(tx, input.slotId)
      if (beatHolds) return err("slot-occupied")

      await tx
        .insert(campaignSlotDungeon)
        .values({ slotId: input.slotId, dungeonId: input.dungeonId })
      return ok(undefined)
    })
  )
}

/** Removes the claim — the slot reverts to downtime (set-aside entries resurface). */
export async function unclaimDungeonSlot(input: {
  campaignId: string
  slotId: string
}): Promise<
  Result<void, "clock-not-found" | "claim-not-found" | "frozen-day">
> {
  return guardMany(async (tx) => {
    const slot = await lockSlotInCampaign(tx, input.campaignId, input.slotId)
    if (!slot) return err("claim-not-found")

    const clock = await clockRow(tx, input.campaignId)
    if (!clock) return err("clock-not-found")
    if (isFrozenDay(slot.day, clock.currentDay)) return err("frozen-day")

    const deleted = await tx
      .delete(campaignSlotDungeon)
      .where(eq(campaignSlotDungeon.slotId, input.slotId))
      .returning({ slotId: campaignSlotDungeon.slotId })
    if (deleted.length === 0) return err("claim-not-found")
    return ok(undefined)
  })
}

/** Mark resolved / Reopen on the claim. LWW like a beat's `resolvedAt`. */
export async function setDungeonSlotResolved(input: {
  campaignId: string
  slotId: string
  resolved: boolean
}): Promise<Result<void, "claim-not-found">> {
  return guardMany(async (tx) => {
    const slot = await slotInCampaign(tx, input.campaignId, input.slotId)
    if (!slot) return err("claim-not-found")

    const updated = await tx
      .update(campaignSlotDungeon)
      .set({ resolvedAt: input.resolved ? new Date() : null })
      .where(eq(campaignSlotDungeon.slotId, input.slotId))
      .returning({ slotId: campaignSlotDungeon.slotId })
    if (updated.length === 0) return err("claim-not-found")
    return ok(undefined)
  })
}

async function slotHoldsBeat(
  executor: WriteExecutor,
  slotId: string
): Promise<boolean> {
  const [row] = await executor
    .select({ id: campaignBeat.id })
    .from(campaignBeat)
    .where(eq(campaignBeat.scheduledSlotId, slotId))
  return row !== undefined
}

/**
 * The slot read that also takes the mutual-exclusion **row lock** (`FOR
 * UPDATE`): a waiter's later statements see the winner's committed writes
 * under READ COMMITTED, so the beat/claim existence checks re-evaluate
 * correctly after the lock is granted.
 */
async function lockSlotInCampaign(
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
    .for("update")
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

/** Maps the claim PK's 23505 (fully-concurrent double-claim) to `"slot-occupied"`. */
async function mapClaimRaceToOccupied<T, E>(
  write: Promise<Result<T, E | "slot-occupied">>
): Promise<Result<T, E | "slot-occupied">> {
  try {
    return await write
  } catch (error) {
    if (isClaimUniqueViolation(error)) return err("slot-occupied")
    throw error
  }
}

function isClaimUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return code === "23505" && constraint === "campaignSlotDungeon_pkey"
}
