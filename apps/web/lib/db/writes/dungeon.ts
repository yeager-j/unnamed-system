import { and, eq, inArray } from "drizzle-orm"

import {
  dungeonStateSchema,
  type DungeonState,
  type DungeonStatus,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { isFrozenDay } from "@/domain/planner/clock"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  campaignClock,
  campaignSlot,
  campaignSlotDungeon,
} from "@/lib/db/schema/campaign-clock"
import { dungeons, type DungeonRow } from "@/lib/db/schema/dungeon"
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
    /** Set only when minting a Region **expedition** (UNN-589 D5); immutable
     *  after — `loadDungeonVariantForWrite` discriminates on it forever. */
    regionId?: string
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
        regionId: input.regionId,
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
 * {@link import("./encounter").saveEncounterSession}; pass an `executor` to
 * compose inside a `guardMany` lifecycle command.
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

/**
 * Flips `draft → active` **and** persists the start-composed
 * {@link DungeonState} in one guarded bump (UNN-590): expedition start now
 * writes the initial draw ledger (seed, post-start `streamCursors`, seeded
 * `mintedUniqueKeys`) alongside the status flip, and two back-to-back guarded
 * bumps on the same version token cannot both condition on `expectedVersion` —
 * one UPDATE keeps the activation atomic and the one-active partial index
 * firing on the same statement `mapActivationRaceToActiveDelve` maps.
 */
export async function activateDungeonWithState(
  executor: WriteExecutor,
  dungeonId: string,
  state: DungeonState,
  expectedVersion: number
): Promise<Result<{ version: number }, DungeonWriteError>> {
  return bumpDungeonVersionGuarded(executor, dungeonId, expectedVersion, {
    status: "active",
    state,
  })
}

/**
 * The lifecycle-serialization read (D11, UNN-589; de-versioned by UNN-657):
 * `SELECT … FOR UPDATE` on the dungeon row, as the **first statement** of
 * every lifecycle `guardMany` body (expedition start/finish, combat start/end,
 * the generic status flip). From this statement to commit the transaction
 * holds the dungeon row lock, so every competing lifecycle action blocks here
 * and, when it unblocks, re-reads the winner's committed truth — which is
 * what makes the body's *cross-row* reads (live encounter, instance, region)
 * stable without pessimistic locks on those rows. Semantic preconditions
 * (status, turn) are checked on the LOCKED row by each caller; the caller
 * saves guarded on `row.version` (vacuous guard). The client `expectedVersion`
 * compare retired with the command queue.
 *
 * A tombstoned (`deletedAt`) row reads as `"dungeon-not-found"`: `archiveDungeon`
 * writes the tombstone without a version bump, but its UPDATE takes this same
 * row lock, so the two orderings serialize here and the locked read sees it.
 *
 * **Lock-order discipline:** every multi-row dungeon-family transaction acquires
 * **dungeon → mapInstance → encounter → region**. Nothing in the type system
 * enforces this — a new lifecycle action that locks in a different order is a
 * deadlock, not a conflict.
 */
export async function lockDungeonRowForLifecycle(
  tx: WriteExecutor,
  dungeonId: string
): Promise<Result<DungeonRow, DungeonWriteError>> {
  const [row] = await tx
    .select()
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .for("update")
  if (!row || row.deletedAt !== null) return err("dungeon-not-found")
  return ok({ ...row, state: dungeonStateSchema.parse(row.state) })
}

/**
 * Bumps the dungeon `version` with no column change — the lifecycle-visibility
 * bump (D11): combat start changes no dungeon column, but bumping the token is
 * what makes it *visible* to every other lifecycle actor's guard (a finish
 * racing a combat start conflicts here instead of committing over a live
 * encounter it never saw).
 */
export async function touchDungeonLifecycle(
  executor: WriteExecutor,
  dungeonId: string,
  expectedVersion: number
): Promise<Result<{ version: number }, DungeonWriteError>> {
  return bumpDungeonVersionGuarded(executor, dungeonId, expectedVersion, {})
}

/**
 * Maps the one-active partial unique index's 23505 (two fully-concurrent
 * activations — both passed the friendly app-side read, the second `UPDATE …
 * SET status='active'` lost at `dungeon_one_active_per_campaign`) to the same
 * `"campaign-already-has-active-delve"` the read path returns. Wraps the whole
 * `guardMany` call, not the inner write: the throw must first roll the
 * transaction back. Any other 23505 (or any other error) propagates — a
 * constraint we didn't anticipate is a bug, not a domain refusal. Mirrors
 * `mapClaimRaceToOccupied` (campaign-slot-dungeon.ts).
 */
export async function mapActivationRaceToActiveDelve<T, E>(
  write: Promise<Result<T, E | "campaign-already-has-active-delve">>
): Promise<Result<T, E | "campaign-already-has-active-delve">> {
  try {
    return await write
  } catch (error) {
    if (isOneActiveViolation(error)) {
      return err("campaign-already-has-active-delve")
    }
    throw error
  }
}

function isOneActiveViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return code === "23505" && constraint === "dungeon_one_active_per_campaign"
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
