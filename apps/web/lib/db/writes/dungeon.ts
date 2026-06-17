import { and, eq, sql } from "drizzle-orm"

import {
  err,
  ok,
  type DungeonState,
  type DungeonStatus,
  type Result,
} from "@workspace/game/foundation"

import { db, type WriteExecutor } from "@/lib/db/client"
import { dungeons } from "@/lib/db/schema/dungeon"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Persistence for a dungeon and its serialized {@link DungeonState} (Dungeon Map
 * ADR — the exploration-time layer over a Map Instance). The campaign DM is the
 * sole writer, so a single `version` token guards every mutation: each guarded
 * write bumps `version` while conditioning on `(id, version === expectedVersion)`,
 * and on zero affected rows disambiguates `"stale"` from `"dungeon-not-found"`.
 *
 * This is pure persistence — the DM authorization (`requireCampaignDM`) lives at
 * the Server Action boundary that calls these, exactly as the encounter writes
 * stay auth-free behind the gate. It mirrors {@link import("./encounter")} rather
 * than folding into the character `version-guard` primitive: that one is
 * per-class and character-table-coupled, whereas the dungeon has a single version
 * column — a simpler guard whose only shared trait is the conditioned-update
 * *shape*.
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
 * Runs a guarded single-version bump: applies `patch` together with the
 * `version + 1` increment in one `SET`, conditioned on `(id, version ===
 * expectedVersion)`, and returns the bumped version. On zero affected rows it
 * disambiguates `"stale"` (row exists, token moved) from `"dungeon-not-found"`
 * (row gone) via {@link dungeonExists}, run on the same executor so the check
 * shares the caller's transaction snapshot.
 */
async function bumpDungeonVersionGuarded(
  executor: WriteExecutor,
  dungeonId: string,
  expectedVersion: number,
  patch: Partial<typeof dungeons.$inferInsert>
): Promise<Result<{ version: number }, DungeonWriteError>> {
  const updated = await executor
    .update(dungeons)
    .set({ ...patch, version: sql`${dungeons.version} + 1` })
    .where(
      and(eq(dungeons.id, dungeonId), eq(dungeons.version, expectedVersion))
    )
    .returning({ version: dungeons.version })

  if (updated.length === 0) {
    return (await dungeonExists(executor, dungeonId))
      ? err("stale")
      : err("dungeon-not-found")
  }

  return ok({ version: updated[0]!.version })
}

/** Existence check for the zero-row disambiguation, on the caller's executor. */
async function dungeonExists(
  executor: WriteExecutor,
  dungeonId: string
): Promise<boolean> {
  const [row] = await executor
    .select({ id: dungeons.id })
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .limit(1)

  return row !== undefined
}
