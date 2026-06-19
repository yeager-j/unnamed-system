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
 * The Zone ids a combatant may move to this turn (UNN-467 dungeon combat). The
 * acting Zone is always excluded — you don't "move" in place. Targets are the
 * acting Zone's **adjacent** Zones (the rulebook movement rule), unless the DM's
 * move-anywhere override is on (or the combatant stands off the graph), which
 * opens it to every other Zone. Self-exclusion is applied once over either
 * branch so both carry the same guarantee. Returns `[]` when the combatant has
 * no token (isn't on the board).
 */
export function movableZonesForCombatant(
  instance: MapInstanceState,
  combatantId: string,
  options: { anywhere: boolean }
): string[] {
  const fromZoneId = instance.occupancy[combatantId]?.zoneId
  if (fromZoneId === undefined) return []

  const onGraph = instance.geometry.zones[fromZoneId] !== undefined
  const candidateIds =
    options.anywhere || !onGraph
      ? Object.keys(instance.geometry.zones)
      : adjacentZones(instance, fromZoneId).map((zone) => zone.id)

  return candidateIds.filter((id) => id !== fromZoneId)
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
