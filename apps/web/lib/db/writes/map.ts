import { eq } from "drizzle-orm"

import { mapGeometrySchema, type MapGeometry } from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import { db } from "@/lib/db/client"
import { maps } from "@/lib/db/schema/map"
import { insertWithShortId } from "@/lib/db/short-id"
import { lastWriterWinsUpdate } from "@/lib/db/writes/last-writer-wins-update"

/**
 * Persistence for the `map` table — the user-owned dungeon templates (Dungeon Map
 * ADR, *Persistence & concurrency*). Like the other write wrappers this is
 * auth-free; the owner authorization (`requireMapOwner`) lives at the Server
 * Action boundary that calls it.
 *
 * Map authoring is single-owner and each autosave patches one field, so writes
 * use deliberate last-writer-wins concurrency. The row's `version` remains an
 * authority-owned revision counter so an older, still-open versioned client
 * fails stale instead of overlooking a new LWW write during deployment overlap.
 * Current write commands neither send nor return it.
 */

type MapWriteError = "map-not-found"

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
 * Replaces the whole `geometry` blob and advances the row revision. This is the
 * write UNN-461's canvas node-drag / adjacency edits call.
 */
export async function saveMapGeometry(
  mapId: string,
  geometry: MapGeometry
): Promise<Result<void, MapWriteError>> {
  return updateMap(mapId, { geometry })
}

/**
 * The autosaved Map name (no Save button). Same per-field LWW primitive as
 * {@link saveMapGeometry}, different patch.
 */
export async function renameMap(
  mapId: string,
  name: string
): Promise<Result<void, MapWriteError>> {
  return updateMap(mapId, { name })
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

async function updateMap(
  mapId: string,
  patch: Partial<typeof maps.$inferInsert>
): Promise<Result<void, MapWriteError>> {
  return lastWriterWinsUpdate({
    table: maps,
    id: mapId,
    patch,
    notFound: "map-not-found",
  })
}
