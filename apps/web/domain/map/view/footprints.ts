import type { MapZone, MapZoneSize } from "@workspace/game-v2/spatial"

/**
 * The pure **footprint vocabulary** for the canvas set-piece renderer (UNN-630, §D2)
 * — the one home that turns a Zone's authored `size` into a fixed world-unit rect,
 * plus the derivations that ride on it (token capacity, overlap detection). It lives
 * in `domain/map/view/` rather than the engine (the engine assigns `size` no
 * mechanical meaning — it never learns what an "L" is) or the kit (which is
 * engine-free and imports this downward). `ZoneSize` **aliases** the engine enum, so
 * there is no parallel union to keep in correspondence.
 *
 * Dimensions are multiples of the canvas grid (16 wu) so a size change grows/shrinks
 * right-and-down with no re-snap, and `M` matches today's card (≈344×192) closely
 * enough that existing maps don't reflow badly.
 */

/** A Zone's authored footprint size — the engine enum, re-exported for domain readers. */
export type ZoneSize = MapZoneSize

/** The fixed world-unit rect each authored `size` maps to. */
export const ZONE_FOOTPRINTS: Record<ZoneSize, { w: number; h: number }> = {
  S: { w: 208, h: 160 },
  M: { w: 336, h: 192 },
  L: { w: 432, h: 256 },
  XL: { w: 560, h: 320 },
}

/** The rect for a Zone's `size`, defaulting an unset size to `M` (the render-side default). */
export const footprintOf = (size: ZoneSize | undefined) =>
  ZONE_FOOTPRINTS[size ?? "M"]

/**
 * How many combatant tokens a zone's Closeup grid holds before it degrades to the
 * condensed stack — the handoff's two-column formula, minus the 24-wu header row each
 * rendered engagement cluster spends. `clusterCount` is the number of **multi-member**
 * melee clusters drawn in the zone (0 outside combat). Derived caps with no clusters:
 * S 2 · M 4 · L 8 · XL 10.
 */
export const zoneTokenCapacity = (
  size: ZoneSize | undefined,
  clusterCount = 0
) => {
  const { h } = footprintOf(size)
  return Math.max(1, Math.floor((h - 72 - 24 * clusterCount) / 46)) * 2
}

/** A positioned axis-aligned footprint rect for overlap tests. */
type PlacedRect = { id: string; x: number; y: number; w: number; h: number }

const rectOf = (
  zone: Pick<MapZone, "id" | "position" | "size">
): PlacedRect => ({
  id: zone.id,
  x: zone.position.x,
  y: zone.position.y,
  ...footprintOf(zone.size),
})

/** True when two placed rects share any interior area (edge-touching is not overlap). */
const overlaps = (a: PlacedRect, b: PlacedRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * The pairs of zones whose footprints overlap — the net-new footprint-collision
 * warning (§D2; today's engine warnings are disconnected + duplicate-name only). Each
 * colliding pair is reported once, in encounter order; the id ordering within a pair
 * follows the iteration order of the input. Non-blocking, like the other warnings.
 */
export const overlappingZonePairs = (
  zones: Iterable<Pick<MapZone, "id" | "position" | "size">>
): [string, string][] => {
  const rects = [...zones].map(rectOf)
  const pairs: [string, string][] = []
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i]!, rects[j]!)) {
        pairs.push([rects[i]!.id, rects[j]!.id])
      }
    }
  }
  return pairs
}
