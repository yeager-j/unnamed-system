import type { MapGeometry } from "@workspace/game/foundation/map/geometry"

/**
 * Pure non-blocking validations over a {@link MapGeometry} (UNN-461). A gridless
 * dungeon tolerates an isolated Zone and a repeated name, so these are surfaced as
 * **warnings** the canvas shows but never as blocks on the autosave (PRD FR-1: "a
 * disconnected graph or duplicate Zone names are warnings, not blocks").
 */

/**
 * Ids of Zones with no incident connection — isolated nodes. Empty until there are
 * **two** Zones (a lone Zone has nothing to connect to, so flagging it is noise).
 */
export function disconnectedZoneIds(geometry: MapGeometry): string[] {
  const zones = Object.values(geometry.zones)
  if (zones.length < 2) return []

  const connected = new Set<string>()
  for (const connection of Object.values(geometry.connections)) {
    connected.add(connection.fromZoneId)
    connected.add(connection.toZoneId)
  }

  return zones.filter((zone) => !connected.has(zone.id)).map((zone) => zone.id)
}

/**
 * The display names shared by more than one Zone (compared trimmed +
 * case-insensitive), one representative per colliding group — what the warning
 * banner lists.
 */
export function duplicateZoneNames(geometry: MapGeometry): string[] {
  const firstSeen = new Map<string, string>()
  const duplicates = new Map<string, string>()

  for (const zone of Object.values(geometry.zones)) {
    const key = zone.name.trim().toLowerCase()
    if (key.length === 0) continue
    if (firstSeen.has(key)) {
      duplicates.set(key, firstSeen.get(key)!)
    } else {
      firstSeen.set(key, zone.name.trim())
    }
  }

  return [...duplicates.values()]
}
