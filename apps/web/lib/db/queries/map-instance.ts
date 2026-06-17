import { eq } from "drizzle-orm"

import { mapInstanceStateSchema } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { mapInstances, type MapInstanceRow } from "@/lib/db/schema/map-instance"

/**
 * Reads for the `mapInstance` table — the per-run spatial truth an encounter
 * references by `mapInstanceId` (Dungeon Map ADR). Like the encounter loader, the
 * jsonb `state` is parsed through {@link mapInstanceStateSchema} on read so zod
 * defaults run and a blob persisted before a field existed can't reach a caller
 * with that field `undefined`. The combat console + player watch load this
 * alongside the encounter to render position / engagement / enchantment, which
 * the M0 cutover (UNN-459) moved off the `CombatSession`.
 */
function withParsedState(row: MapInstanceRow): MapInstanceRow {
  return { ...row, state: mapInstanceStateSchema.parse(row.state) }
}

/** The `mapInstance` row by id (state parsed), or `null` when none matches. */
export async function loadMapInstanceById(
  mapInstanceId: string
): Promise<MapInstanceRow | null> {
  const [row] = await db
    .select()
    .from(mapInstances)
    .where(eq(mapInstances.id, mapInstanceId))
    .limit(1)

  return row ? withParsedState(row) : null
}
