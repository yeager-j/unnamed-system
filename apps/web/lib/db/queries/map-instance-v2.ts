import { eq } from "drizzle-orm"

import {
  mapInstanceStateSchema,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"

import { db } from "@/lib/db/client"
import { mapInstances } from "@/lib/db/schema/map-instance"

/**
 * The **v2-typed** Map-Instance read (UNN-520) — the parallel twin of
 * {@link import("./map-instance").loadMapInstanceById} for the v2 combat write
 * path. Same row, same jsonb blob; the difference is the boundary parse: the
 * `state` runs through engine-v2's {@link mapInstanceStateSchema}, so the
 * returned state carries v2's types (branded `ParticipantId`s inside
 * engagement) and feeds the v2 spatial reducers without a cast. The shapes are
 * physically identical across the two engines (D32 re-declaration), so either
 * parse accepts the same blob; each engine's consumers read through their own.
 */
export interface MapInstanceRowV2 {
  id: string
  state: MapInstanceState
  version: number
}

/** The `mapInstance` row by id (state parsed as v2), or `null` when none matches. */
export async function loadMapInstanceV2ById(
  mapInstanceId: string
): Promise<MapInstanceRowV2 | null> {
  const [row] = await db
    .select({
      id: mapInstances.id,
      state: mapInstances.state,
      version: mapInstances.version,
    })
    .from(mapInstances)
    .where(eq(mapInstances.id, mapInstanceId))
    .limit(1)

  return row ? { ...row, state: mapInstanceStateSchema.parse(row.state) } : null
}
