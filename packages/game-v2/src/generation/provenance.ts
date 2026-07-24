import type { MapGeometry } from "@workspace/game-v2/spatial/geometry.schema"
import type {
  GenerationState,
  MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"

/**
 * The **start-time provenance stamp** of the ledger law (procedural-dungeons tech
 * design D5). Called **once** at expedition start on the fresh seed-Map snapshot,
 * *before* any generation roll: every Zone the snapshot carries is authored, so
 * every current geometry Zone is stamped `{ source: "authored", depth }`.
 *
 * Authored provenance is what later lets `foldExpedition` decide which revealed
 * Zones fold back to the Region's `staticReveal` — a stable place the party mapped
 * is worth carrying forward; generated and manual space (stamped later, in the
 * reducer / by the roller) is visit-scoped and never folds. Because the snapshot is
 * fresh (no generated or manual Zones exist yet), replacing `generation.zones`
 * wholesale is exactly right; the other generation records are preserved untouched.
 *
 * Returns a **fresh** state — it does not mutate its input (the caller threads it
 * through the expedition-start transaction).
 */
export function withAuthoredProvenance(
  state: MapInstanceState,
  startingZoneIds: readonly string[] = []
): MapInstanceState {
  const depths = authoredDepths(state.geometry, startingZoneIds)
  const zones: GenerationState["zones"] = {}
  for (const zoneId of Object.keys(state.geometry.zones)) {
    const templateKey = state.geometry.zones[zoneId]?.templateKey
    zones[zoneId] = {
      source: "authored",
      depth: depths[zoneId] ?? 0,
      ...(templateKey === undefined ? {} : { templateKey }),
    }
  }
  return {
    ...state,
    generation: { ...state.generation, zones },
  }
}

/**
 * Authored **depths** — multi-source BFS distance from the nearest starting Zone
 * (D5: placement is per-character, so a split start is legal and "the entrance"
 * is a set). Traverses **every** connection, locked and hidden included: depth is
 * world topology (how far a room *is*), not knowledge (whether the party can pass
 * yet) — a draw's `minDepth` should not shift when the DM unlocks a door.
 *
 * Zones unreachable from any starting Zone — and every Zone when the starting set
 * is empty (the pre-P3 call shape) — get depth 0. Deliberate fail-shallow: a
 * defaulted 0 can only *under*-qualify a deep draw, never falsely qualify one,
 * and generated children still derive parent + 1 at mint. Starting ids naming no
 * real Zone are ignored.
 */
export function authoredDepths(
  geometry: MapGeometry,
  startingZoneIds: readonly string[]
): Record<string, number> {
  const sources = startingZoneIds.filter(
    (zoneId) => geometry.zones[zoneId] !== undefined
  )
  const depths: Record<string, number> = {}
  const queue: string[] = []
  for (const zoneId of sources) {
    if (depths[zoneId] === undefined) {
      depths[zoneId] = 0
      queue.push(zoneId)
    }
  }

  const neighbors: Record<string, string[]> = {}
  for (const connection of Object.values(geometry.connections)) {
    ;(neighbors[connection.fromZoneId] ??= []).push(connection.toZoneId)
    ;(neighbors[connection.toZoneId] ??= []).push(connection.fromZoneId)
  }

  for (let head = 0; head < queue.length; head++) {
    const zoneId = queue[head]!
    for (const neighborId of neighbors[zoneId] ?? []) {
      if (
        depths[neighborId] === undefined &&
        geometry.zones[neighborId] !== undefined
      ) {
        depths[neighborId] = depths[zoneId]! + 1
        queue.push(neighborId)
      }
    }
  }
  return depths
}
