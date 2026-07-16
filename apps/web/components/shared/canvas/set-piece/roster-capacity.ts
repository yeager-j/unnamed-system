import { zoneTokenCapacity, type ZoneSize } from "@/domain/map/view/footprints"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

/**
 * The Closeup roster's fit-vs-degrade decision (Dungeon Visual Overhaul §D7),
 * decided **once** in the kit so every surface stays blind to it. A zone renders
 * full two-column tokens only while they fit its footprint's
 * {@link zoneTokenCapacity}; over cap it degrades to the condensed avatar stack +
 * "Open roster ▸" (the roster inspector holds the truth). Pure — no React, so it
 * unit-tests in Node.
 */

/**
 * The number of **multi-member** melee clusters among these occupants — the
 * `clusterCount` {@link zoneTokenCapacity} charges a header row for. `engagementGroup`
 * is assigned only to multi-member clusters (a Free singleton is `undefined`), so the
 * count is simply the number of distinct group ids present.
 */
export function multiMemberClusterCount(occupants: SetPieceOccupant[]): number {
  const groups = new Set<number>()
  for (const occupant of occupants) {
    if (occupant.engagementGroup !== undefined) {
      groups.add(occupant.engagementGroup)
    }
  }
  return groups.size
}

/**
 * Whether a zone's Closeup can render every occupant as a full token, or must
 * degrade to the condensed stack. `true` ⇒ full tokens; `false` ⇒ condensed stack.
 * Two disjoint melee pairs in an `M` room compute `cap = 2 < 4` and degrade (AC 2).
 */
export function closeupFitsInCard(
  size: ZoneSize | undefined,
  occupants: SetPieceOccupant[]
): boolean {
  return (
    occupants.length <=
    zoneTokenCapacity(size, multiMemberClusterCount(occupants))
  )
}
