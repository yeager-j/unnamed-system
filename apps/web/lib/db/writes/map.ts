import { and, eq, sql } from "drizzle-orm"

import { mapGeometrySchema, type MapGeometry } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { maps } from "@/lib/db/schema/map"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Persistence for the `map` table — the user-owned dungeon templates (Dungeon Map
 * ADR, *Persistence & concurrency*). Like the other write wrappers this is
 * auth-free; the owner authorization (`requireMapOwner`) lives at the Server
 * Action boundary that calls it.
 *
 * A single `version` token guards every mutation, mirroring the encounter /
 * Instance writes ({@link import("./map-instance").saveMapInstanceState}): each
 * guarded write bumps `version` while conditioning on `(id, version ===
 * expectedVersion)`, and on zero affected rows disambiguates `"stale"` from
 * `"map-not-found"`. This is **not** folded into the character `version-guard`
 * primitive (that one is per-class and character-table-coupled); the only shared
 * trait is the conditioned-update shape. These run on the base `db` — Map
 * authoring is single-owner with no cross-row atomic gesture (no `guardMany`).
 */

export type MapWriteError = "map-not-found" | "stale"

/**
 * Creates an empty Map owned by `userId` with a minted, collision-retried
 * `shortId` (the My Maps editor URL). Geometry starts empty; the editor (UNN-461's
 * canvas) autosaves Zones/connections into it. Returns the new `id` + `shortId`
 * so the action can redirect to `/maps/{shortId}` (mirrors `createCampaign`).
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

/**
 * Runs a guarded single-version bump: applies `patch` together with the
 * `version + 1` increment in one `SET`, conditioned on `(id, version ===
 * expectedVersion)`, and returns the bumped version. On zero affected rows it
 * disambiguates `"stale"` (row exists, token moved) from `"map-not-found"`
 * (row gone).
 */
async function bumpMapVersionGuarded(
  mapId: string,
  expectedVersion: number,
  patch: Partial<typeof maps.$inferInsert>
): Promise<Result<{ version: number }, MapWriteError>> {
  const updated = await db
    .update(maps)
    .set({ ...patch, version: sql`${maps.version} + 1` })
    .where(and(eq(maps.id, mapId), eq(maps.version, expectedVersion)))
    .returning({ version: maps.version })

  if (updated.length === 0) {
    return (await mapExists(mapId)) ? err("stale") : err("map-not-found")
  }

  return ok({ version: updated[0]!.version })
}

/** Existence check for the zero-row disambiguation. */
async function mapExists(mapId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: maps.id })
    .from(maps)
    .where(eq(maps.id, mapId))
    .limit(1)

  return row !== undefined
}
