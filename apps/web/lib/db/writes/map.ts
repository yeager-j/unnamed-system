import { eq } from "drizzle-orm"

import { mapGeometrySchema, type MapGeometry } from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import { db, type WriteExecutor } from "@/lib/db/client"
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
 * {@link guardedVersionUpdate}. The Headcanon command supplies its attempt
 * transaction and the version it just loaded; standalone callers may use `db`.
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
 * Stores the geometry produced by reducing intent over the authority attempt's
 * current row, guarded by that row's observed version. A lost guard is command
 * contention, so Headcanon reruns the entire load/reduce/write attempt.
 */
export async function saveMapGeometry(
  mapId: string,
  geometry: MapGeometry,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, MapWriteError>> {
  return bumpMapVersionGuarded(mapId, expectedVersion, { geometry }, executor)
}

/**
 * The guarded name Store. Name and geometry share one row version, while the
 * Headcanon root owns client ordering and the authority owns contention retry.
 */
export async function renameMap(
  mapId: string,
  name: string,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, MapWriteError>> {
  return bumpMapVersionGuarded(mapId, expectedVersion, { name }, executor)
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
  patch: Partial<typeof maps.$inferInsert>,
  executor: WriteExecutor
): Promise<Result<{ version: number }, MapWriteError>> {
  return guardedVersionUpdate({
    table: maps,
    id: mapId,
    expectedVersion,
    patch,
    notFound: "map-not-found",
    executor,
  })
}
