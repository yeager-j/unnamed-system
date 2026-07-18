import {
  footprintOf,
  rectOfZone,
  rectsOverlap,
  ZONE_FOOTPRINTS,
  type MapZone,
  type MapZoneSize,
} from "@workspace/game-v2/spatial"

/**
 * The domain face of the **footprint vocabulary** (UNN-630, §D2). The table and
 * rect math re-homed into the engine in P3 (UNN-590) — the generation layout gives
 * footprints mechanical meaning, so `packages/game-v2/src/spatial/footprints.ts` is
 * the one authority — and this module re-exports them for the canvas kit (which is
 * engine-free and imports this downward) plus keeps the view-tier derivations that
 * ride on the table: token capacity and the editor's overlap warning.
 */

/** A Zone's authored footprint size — the engine enum, re-exported for domain readers. */
export type ZoneSize = MapZoneSize

export { footprintOf, ZONE_FOOTPRINTS }

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

/**
 * The pairs of zones whose footprints overlap — the net-new footprint-collision
 * warning (§D2; today's engine warnings are disconnected + duplicate-name only). Each
 * colliding pair is reported once, in encounter order; the id ordering within a pair
 * follows the iteration order of the input. Non-blocking, like the other warnings.
 */
export const overlappingZonePairs = (
  zones: Iterable<Pick<MapZone, "id" | "position" | "size">>
): [string, string][] => {
  const placed = [...zones].map((zone) => ({
    id: zone.id,
    rect: rectOfZone(zone),
  }))
  const pairs: [string, string][] = []
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (rectsOverlap(placed[i]!.rect, placed[j]!.rect)) {
        pairs.push([placed[i]!.id, placed[j]!.id])
      }
    }
  }
  return pairs
}
