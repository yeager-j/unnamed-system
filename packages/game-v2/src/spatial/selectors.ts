import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { ZoneEnchantment } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

import type { MapGeometry, MapZone } from "./geometry.schema"
import type { MapInstanceState } from "./map-instance.schema"

/**
 * The **pure read selectors** over {@link MapInstanceState} the combat composition
 * binds its `SpatialReads` adapter from (ADR §2.6/SD8 — the subtlest correctness
 * point). Spatial exports these raw selectors over its **own** state and names
 * **neither** the `SpatialReads` port **nor** any `encounter/` type: a spatial
 * module that implemented the port (or produced `Position`) would import
 * `encounter/` and break the one-way seam (SD2). The combat side wraps these
 * `satisfies SpatialReads` and projects the occupancy token into the read-bag
 * (`encounter/spatial-adapter.ts`); the adapter hop is what keeps the dependency
 * one-way.
 *
 * The `tokenKey` is the occupancy key — opaque and dual-lifecycle (a `participantId`
 * in combat, a `characterId` in exploration, SD5); these selectors treat it as a
 * plain string-map key.
 */

/**
 * The zone a token occupies, or `undefined` when the key holds no token (unplaced /
 * mapless). Mirrors the `SpatialReads.zoneOf` contract exactly, so the adapter is a
 * one-liner: a bare `zoneId` string, never a `Position` component (spatial owns the
 * *fact* of placement without naming the *component*, SD8).
 */
export function zoneOf(
  state: MapInstanceState,
  tokenKey: string
): string | undefined {
  return state.occupancy[tokenKey]?.zoneId
}

/**
 * The single active Zone Enchantment, or `null` when none. The one-active-enchantment
 * rule is structural (a nullable singleton), so this is a bare field read — the value
 * the `SpatialReads.activeEnchantment` singleton returns.
 */
export function activeEnchantment(
  state: MapInstanceState
): ZoneEnchantment | null {
  return state.enchantment
}

/**
 * A token's {@link Engagement}, or **free** when the key holds no token — so a
 * mapless / unplaced participant reads as structurally un-engaged (CD17). The combat
 * read-bag flows this value straight into the `engagement` component (kernel type,
 * SD3 — no `encounter/` import, no duplication).
 */
export function engagementOf(
  state: MapInstanceState,
  tokenKey: string
): Engagement {
  return state.occupancy[tokenKey]?.engagement ?? { status: "free" }
}

/**
 * The undirected neighbor-id map of a connection collection: every zone id that
 * appears as an endpoint mapped to the ids on the far side of its connections.
 * Connections are undirected — either endpoint counts as a neighbor. The shared
 * primitive both {@link adjacencyMap} (over full geometry) and the redacted watch
 * build on: it names only the `{ fromZoneId, toZoneId }` pair, so a redacted
 * snapshot's connection list feeds it as readily as authored geometry (SD2 — no
 * `encounter`/`visibility` import).
 */
export function adjacencyOf(
  connections: Iterable<{ fromZoneId: string; toZoneId: string }>
): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  const link = (from: string, to: string) => (map[from] ??= []).push(to)
  for (const { fromZoneId, toZoneId } of connections) {
    link(fromZoneId, toZoneId)
    link(toZoneId, fromZoneId)
  }
  return map
}

/**
 * Every zone's neighbor ids, keyed by zone id — zones with no borders map to
 * `[]`. The full-geometry form of {@link adjacencyOf} (it seeds every authored
 * zone, so an unconnected zone is present with an empty list). The app-side
 * successor of v1's engine `adjacencyMap` (promoted here once a second consumer
 * appeared — UNN-597).
 */
export function adjacencyMap(geometry: MapGeometry): Record<string, string[]> {
  const map: Record<string, string[]> = Object.fromEntries(
    Object.keys(geometry.zones).map((zoneId) => [zoneId, [] as string[]])
  )
  const walked = adjacencyOf(Object.values(geometry.connections))
  for (const [zoneId, neighborIds] of Object.entries(walked)) {
    map[zoneId]?.push(...neighborIds)
  }
  return map
}

/** The zones adjacent to `zoneId`, resolved to their {@link MapZone}s (a
 *  neighbor whose zone no longer exists is dropped). */
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
