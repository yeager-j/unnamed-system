import type { MapGeometry, MapZone } from "@workspace/game-v2/spatial"

/**
 * Pure adjacency reads over the v2 {@link MapGeometry} connection record — the
 * app-side successors of v1's engine `adjacencyMap`/`adjacentZones` (v2's
 * spatial module ships the reducer + occupancy selectors but no adjacency
 * projection yet; if a second engine-side consumer appears these belong in
 * `packages/game-v2/src/spatial/selectors.ts`). Connections are undirected —
 * either endpoint counts as a neighbor.
 */

/** Every zone's neighbor ids, keyed by zone id (zones with no borders map to `[]`). */
export function adjacencyMap(geometry: MapGeometry): Record<string, string[]> {
  const map: Record<string, string[]> = Object.fromEntries(
    Object.keys(geometry.zones).map((zoneId) => [zoneId, [] as string[]])
  )
  for (const connection of Object.values(geometry.connections)) {
    map[connection.fromZoneId]?.push(connection.toZoneId)
    map[connection.toZoneId]?.push(connection.fromZoneId)
  }
  return map
}

/** The zones adjacent to `zoneId`, resolved to their {@link MapZone}s. */
export function adjacentZones(
  geometry: MapGeometry,
  zoneId: string
): MapZone[] {
  const neighbors = new Set<string>()
  for (const connection of Object.values(geometry.connections)) {
    if (connection.fromZoneId === zoneId) neighbors.add(connection.toZoneId)
    if (connection.toZoneId === zoneId) neighbors.add(connection.fromZoneId)
  }
  return [...neighbors].flatMap((id) => {
    const zone = geometry.zones[id]
    return zone ? [zone] : []
  })
}
