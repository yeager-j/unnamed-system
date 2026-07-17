import { desc, eq } from "drizzle-orm"

import { mapGeometrySchema } from "@workspace/game-v2/spatial"

import { db } from "@/lib/db/client"
import { maps, type MapRow } from "@/lib/db/schema/map"

/**
 * Reads for the `map` table — the user-owned dungeon templates (Dungeon Map ADR,
 * *The four-entity model*). Like the encounter/Instance loaders, the jsonb
 * `geometry` is parsed through {@link mapGeometrySchema} on read so zod defaults
 * run and a blob persisted before a field existed can't reach a caller with that
 * field `undefined`. These back the owner gate (`requireMapOwner`), the My Maps
 * list, and the editor route.
 */
function withParsedGeometry(row: MapRow): MapRow {
  return { ...row, geometry: mapGeometrySchema.parse(row.geometry) }
}

/** The `map` row by id (geometry parsed), or `null` when none matches. Backs
 *  {@link import("@/lib/auth/map-access").requireMapOwner}. */
export async function loadMapRowById(mapId: string): Promise<MapRow | null> {
  const [row] = await db.select().from(maps).where(eq(maps.id, mapId)).limit(1)

  return row ? withParsedGeometry(row) : null
}

/** The `map` row by public `shortId` (the `/stage/maps/{shortId}` editor URL), or
 *  `null` when none matches. */
export async function loadMapByShortId(
  shortId: string
): Promise<MapRow | null> {
  const [row] = await db
    .select()
    .from(maps)
    .where(eq(maps.shortId, shortId))
    .limit(1)

  return row ? withParsedGeometry(row) : null
}

/** Every Map owned by `userId`, newest first — the My Maps list. */
export async function loadMapsByUserId(userId: string): Promise<MapRow[]> {
  const rows = await db
    .select()
    .from(maps)
    .where(eq(maps.userId, userId))
    .orderBy(desc(maps.createdAt))

  return rows.map(withParsedGeometry)
}

/** The owner's Maps as `{ id, name }` reference options (the Set editor's
 *  portal picker + lint `mapIds` vocab). A dedicated projection — the full
 *  loader selects and re-parses every `geometry` blob, a cost that grows with
 *  authored canvas size and buys nothing for a picker. */
export async function loadMapOptionsByUserId(
  userId: string
): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: maps.id, name: maps.name })
    .from(maps)
    .where(eq(maps.userId, userId))
    .orderBy(desc(maps.createdAt))
}
