import { eq } from "drizzle-orm"

import { mapGeometrySchema, type MapGeometry } from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import { db } from "@/lib/db/client"
import { maps } from "@/lib/db/schema/map"
import { insertWithShortId } from "@/lib/db/short-id"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

/**
 * Persistence for the `map` table — the user-owned dungeon templates (Dungeon Map
 * ADR, *Persistence & concurrency*). Like the other write wrappers this is
 * auth-free; the owner authorization (`requireMapOwner`) lives at the Server
 * Action boundary that calls it.
 *
 * A single `version` token guards every mutation through the shared
 * {@link guardedVersionUpdate}. These run on the base `db` — Map authoring is
 * single-owner with no cross-row atomic gesture (no `guardMany`).
 */

type MapWriteError = "map-not-found" | "stale"

/**
 * Creates an empty Map owned by `userId` with a minted, collision-retried
 * `shortId` (the My Maps editor URL). Geometry starts empty; the editor (UNN-461's
 * canvas) autosaves Zones/connections into it. Returns the new `id` + `shortId`
 * so the action can redirect to `/stage/maps/{shortId}` (mirrors `createCampaign`).
 */
export async function createMap(input: {
  userId: string
  name: string
}): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await db
      .insert(maps)
      .values({
        shortId,
        userId: input.userId,
        name: input.name,
        geometry: mapGeometrySchema.parse({}),
      })
      .returning({ id: maps.id, shortId: maps.shortId })

    return row!
  })
}

/**
 * The guarded geometry write: replaces the whole `geometry` blob and bumps
 * `version`, conditioned on the caller's `expectedVersion`. Returns the new
 * version on success. **This is the write UNN-461's canvas node-drag /
 * adjacency edits call.**
 */
export async function saveMapGeometry(
  mapId: string,
  geometry: MapGeometry,
  expectedVersion: number
): Promise<Result<{ version: number }, MapWriteError>> {
  return bumpMapVersionGuarded(mapId, expectedVersion, { geometry })
}

/**
 * The guarded name write — the autosaved Map name (no Save button). Same guarded
 * primitive as {@link saveMapGeometry}, different patch: name and geometry share
 * the one `version` token, each round-tripping it on its own save.
 */
export async function renameMap(
  mapId: string,
  name: string,
  expectedVersion: number
): Promise<Result<{ version: number }, MapWriteError>> {
  return bumpMapVersionGuarded(mapId, expectedVersion, { name })
}

/**
 * Deletes a Map. A plain `DELETE`: the `mapInstance.mapId → map` FK is
 * `onDelete: "set null"`, so any minted Instance survives with `mapId = null`
 * (the snapshot-isolation premise — deleting a template never touches live
 * runtime). No live-Instance check is needed — the Map is a template, not a
 * delve's spatial truth.
 */
export async function deleteMap(mapId: string): Promise<void> {
  await db.delete(maps).where(eq(maps.id, mapId))
}

/** The shared single-version guard, bound to this aggregate's table + error. */
async function bumpMapVersionGuarded(
  mapId: string,
  expectedVersion: number,
  patch: Partial<typeof maps.$inferInsert>
): Promise<Result<{ version: number }, MapWriteError>> {
  return guardedVersionUpdate({
    table: maps,
    id: mapId,
    expectedVersion,
    patch,
    notFound: "map-not-found",
  })
}
