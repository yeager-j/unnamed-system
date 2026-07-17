import { and, eq, inArray } from "drizzle-orm"

import type { DungeonState, DungeonStatus } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { isFrozenDay } from "@/domain/planner/clock"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { dungeons } from "@/lib/db/schema/dungeon"
import { insertWithShortId } from "@/lib/db/short-id"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

import { guardMany } from "./guard-many"

/**
 * Persistence for a dungeon and its serialized {@link DungeonState} (Dungeon Map
 * ADR — the exploration-time layer over a Map Instance). The campaign DM is the
 * sole writer, so a single `version` token guards every mutation through the
 * shared {@link guardedVersionUpdate}.
 *
 * This is pure persistence — the DM authorization (`requireCampaignDM`) lives at
 * the Server Action boundary that calls these, exactly as the encounter writes
 * stay auth-free behind the gate.
 */

export type DungeonWriteError = "dungeon-not-found" | "stale"

/**
 * Inserts a fresh `draft` dungeon (version 0) for `campaignId` with a minted,
 * collision-retried `shortId`, referencing the Map Instance the create action
 * mints in the same transaction, and returns its `id` + `shortId`. `status` rides
 * the column default (`draft`); the caller passes the initial `state`
 * (`createDungeonState()`). Pass the same `executor` so the Instance + dungeon
 * inserts share one snapshot.
 */
export async function createDungeon(
  input: {
    campaignId: string
    name: string
    mapInstanceId: string
    state: DungeonState
  },
  executor: WriteExecutor = db
): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await executor
      .insert(dungeons)
      .values({
        campaignId: input.campaignId,
        name: input.name,
        mapInstanceId: input.mapInstanceId,
        shortId,
        state: input.state,
      })
      .returning({ id: dungeons.id, shortId: dungeons.shortId })

    return row!
  })
}

/**
 * Flips a dungeon's lifecycle `status` (`draft` → `active` → `done`) in a single
 * version-guarded write, returning the new version. The one-active-delve guard is
 * a read-then-act at the Server Action boundary (mirroring the one-live-encounter
 * guard), not here. Mirrors {@link import("./encounter").setEncounterStatus}.
 */
export async function setDungeonStatus(
  dungeonId: string,
  status: DungeonStatus,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, DungeonWriteError>> {
  return bumpDungeonVersionGuarded(executor, dungeonId, expectedVersion, {
    status,
  })
}

/**
 * Persists the dungeon's whole {@link DungeonState} blob in one version-guarded
 * write (the turn-loop `markActed`/`advanceTurn` reducers + the reminder-setting
 * merges write through here), returning the new version. Mirrors
 * {@link import("./encounter").saveEncounterSession} / `saveMapInstanceState`;
 * pass an `executor` to compose inside a `guardMany` (the search-that-reveals
 * cross-write).
 */
export async function saveDungeonState(
  dungeonId: string,
  state: DungeonState,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, DungeonWriteError>> {
  return bumpDungeonVersionGuarded(executor, dungeonId, expectedVersion, {
    state,
  })
}

export type ArchiveDungeonError = "dungeon-not-found" | "clock-not-found"

/**
 * Soft-deletes (archives) a dungeon: the `deletedAt` flip that retires it from
 * the roster/picker while its row survives so frozen-history reads still resolve
 * it (muted, via the `deletedAt`-blind participant/claim reads). Releases only
 * its **present/future** claims to downtime; **frozen** claims (`day <
 * currentDay`) stay pointing at the surviving row, so the slot-kind derivation
 * over past days keeps reading "dungeon" and set-aside suppression holds. Always
 * succeeds (no frozen-day rejection) — the tombstone is what makes deleting a
 * played delve safe, matching {@link import("../../actions/entity/delete")}'s
 * `SET deletedAt = now()` flip.
 */
export async function archiveDungeon(input: {
  campaignId: string
  dungeonId: string
}): Promise<Result<void, ArchiveDungeonError>> {
  return guardMany(async (tx) => {
    const [dungeon] = await tx
      .select({ id: dungeons.id })
      .from(dungeons)
      .where(
        and(
          eq(dungeons.id, input.dungeonId),
          eq(dungeons.campaignId, input.campaignId)
        )
      )
    if (!dungeon) return err("dungeon-not-found")

    const claims = await tx
      .select({ slotId: campaignSlotDungeon.slotId, day: campaignSlot.day })
      .from(campaignSlotDungeon)
      .innerJoin(campaignSlot, eq(campaignSlot.id, campaignSlotDungeon.slotId))
      .where(eq(campaignSlotDungeon.dungeonId, input.dungeonId))

    if (claims.length > 0) {
      const clock = await clockRow(tx, input.campaignId)
      if (!clock) return err("clock-not-found")

      const releasable = claims
        .filter((claim) => !isFrozenDay(claim.day, clock.currentDay))
        .map((claim) => claim.slotId)
      if (releasable.length > 0) {
        await tx
          .delete(campaignSlotDungeon)
          .where(inArray(campaignSlotDungeon.slotId, releasable))
      }
    }

    await tx
      .update(dungeons)
      .set({ deletedAt: new Date() })
      .where(eq(dungeons.id, input.dungeonId))
    return ok(undefined)
  })
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

/** The shared single-version guard, bound to this aggregate's table + error. */
async function bumpDungeonVersionGuarded(
  executor: WriteExecutor,
  dungeonId: string,
  expectedVersion: number,
  patch: Partial<typeof dungeons.$inferInsert>
): Promise<Result<{ version: number }, DungeonWriteError>> {
  return guardedVersionUpdate({
    table: dungeons,
    id: dungeonId,
    expectedVersion,
    patch,
    notFound: "dungeon-not-found",
    executor,
  })
}
