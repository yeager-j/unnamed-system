import { rectOfZone } from "@workspace/game-v2/spatial/footprints"
import type { MapGeometry } from "@workspace/game-v2/spatial/geometry.schema"

import { inHalfPlane, type HalfPlane } from "./layout"

/**
 * **Loop-closure candidate selection** (procedural-dungeons tech design D6,
 * UNN-590): when an expansion comes up a closure instead of a mint, the stub
 * connects to an *existing* zone — filter + pick only. Whether closure fires at
 * all (the per-set `closureChance` roll) belongs to the P3b roller; this module
 * is deliberately roll-free.
 *
 * Filters: same page, within `radius` of the projected position, accepted both
 * ways (the injected `acceptsZone` predicate — template lookups stay in the
 * roller), not already connected to the parent, **not the parent's parent** (a
 * triangle back to grandpa reads as a redundant corridor, not a shortcut), and
 * inside the half-plane under `edge` growth. Nearest candidate by center
 * distance wins; ties break by zone id so the pick is total and deterministic.
 *
 * The grandparent is *currently* subsumed by not-already-connected (grandpa is
 * by construction connected to the parent), so `grandparentZoneId` is an
 * explicit input rather than a derivation: the roller passes it from the mint
 * lineage, and the rule survives a future where the parent–grandparent
 * connection was retracted or hand-deleted.
 */
export function findClosureCandidate(input: {
  geometry: MapGeometry
  pageId: string
  parentZoneId: string
  grandparentZoneId?: string
  projected: { x: number; y: number }
  radius: number
  acceptsZone: (zoneId: string) => boolean
  halfPlane?: HalfPlane
}): string | undefined {
  const { geometry, parentZoneId } = input

  const connectedToParent = new Set<string>()
  for (const connection of Object.values(geometry.connections)) {
    if (connection.fromZoneId === parentZoneId) {
      connectedToParent.add(connection.toZoneId)
    }
    if (connection.toZoneId === parentZoneId) {
      connectedToParent.add(connection.fromZoneId)
    }
  }

  let best: { zoneId: string; distance: number } | undefined
  for (const zone of Object.values(geometry.zones)) {
    if (zone.pageId !== input.pageId) continue
    if (zone.id === parentZoneId) continue
    if (zone.id === input.grandparentZoneId) continue
    if (connectedToParent.has(zone.id)) continue
    if (!input.acceptsZone(zone.id)) continue
    const rect = rectOfZone(zone)
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
    if (
      input.halfPlane !== undefined &&
      !inHalfPlane(center, input.halfPlane)
    ) {
      continue
    }
    const distance = Math.hypot(
      center.x - input.projected.x,
      center.y - input.projected.y
    )
    if (distance > input.radius) continue
    if (
      best === undefined ||
      distance < best.distance ||
      (distance === best.distance && zone.id < best.zoneId)
    ) {
      best = { zoneId: zone.id, distance }
    }
  }
  return best?.zoneId
}
