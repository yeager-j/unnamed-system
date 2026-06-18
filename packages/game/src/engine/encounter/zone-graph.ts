import type {
  MapInstanceState,
  Zone,
} from "@workspace/game/foundation/encounter/map-instance"
import type { MapGeometry } from "@workspace/game/foundation/map/geometry"

/**
 * The zones bordering `zoneId`, resolved to {@link Zone} objects (UNN-313's
 * adjacency; M2/UNN-464 stores it as id-keyed {@link import("@workspace/game/foundation/map/geometry").MapConnection}s,
 * and this is the one place that walks it). Undefined-safe: a connection pointing
 * at a removed zone is skipped. Shared by the battlefield layout (UNN-314,
 * `resolve-zone-layout.ts`) and the move control's target list (UNN-315) so the
 * graph is read one way. A zone is never adjacent to itself (UNN-313 forbids
 * self-loops), so `zoneId` never appears in the result.
 */
export function adjacentZones(
  instance: MapInstanceState,
  zoneId: string
): Zone[] {
  return Object.values(instance.geometry.connections).flatMap((conn) => {
    const otherId =
      conn.fromZoneId === zoneId
        ? conn.toZoneId
        : conn.toZoneId === zoneId
          ? conn.fromZoneId
          : undefined
    if (otherId === undefined || otherId === zoneId) return []
    const zone = instance.geometry.zones[otherId]
    return zone ? [zone] : []
  })
}

/**
 * The full undirected zone-adjacency graph as `zoneId → bordering zoneId[]`,
 * derived from the geometry's id-keyed connections. The wire shape the player
 * snapshot exposes (observable topology, ids only) so the watch view renders the
 * same "Borders" footer the DM grid does without leaking the connections' flags.
 */
export function adjacencyMap(geometry: MapGeometry): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  const link = (from: string, to: string) => {
    const neighbors = (map[from] ??= [])
    if (!neighbors.includes(to)) neighbors.push(to)
  }
  for (const conn of Object.values(geometry.connections)) {
    if (conn.fromZoneId === conn.toZoneId) continue
    if (geometry.zones[conn.fromZoneId] === undefined) continue
    if (geometry.zones[conn.toZoneId] === undefined) continue
    link(conn.fromZoneId, conn.toZoneId)
    link(conn.toZoneId, conn.fromZoneId)
  }
  return map
}
