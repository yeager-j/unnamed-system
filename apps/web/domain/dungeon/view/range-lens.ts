import { hopDistances, type MapConnection } from "@workspace/game-v2/spatial"

import type { ZoneSetPieceHop } from "@/domain/map/view/set-piece-view"

/**
 * The range lens's **one policy home** (Dungeon Visual Overhaul §D5). Every surface
 * feeds this builder its connection set and origin zone(s); none re-decides what a
 * hop counts or how the badge reads. It turns the engine's pure {@link hopDistances}
 * BFS into the per-zone {@link ZoneSetPieceHop} the set-piece card renders.
 *
 * **Traversability is authored adjacency** (rules §3.5, reified): a DM who draws a
 * connection has ruled the zones adjacent, so *all* connections count — locked and
 * secret included (a locked door is "adjacent but Travel-blocked", not "not
 * adjacent"; a truly separating wall is authored as *no* connection). If the table
 * ever rules locked doors shouldn't carry range, the fix is one `filter` here and
 * nowhere else.
 *
 * **Origin policy is the caller's**, passed in:
 * - DM explore — the party-occupied zones (multi-source), always; selection is the
 *   outline only and never re-homes the lens, so the gold ★ Party badge stays put.
 * - DM combat — the acting combatant's zone (no party label).
 * - Watch — the party-occupied zones.
 *
 * `originLabel` is the text the origin badge shows beside its gold `★` (`"Party"`
 * or `""`). Reachable non-origin zones read their hop count; zones absent from the
 * BFS result are unreachable and map to `null` (no badge).
 */
export function buildRangeLens(input: {
  connections: Iterable<Pick<MapConnection, "fromZoneId" | "toZoneId">>
  origins: readonly string[]
  originLabel?: string
}): Record<string, ZoneSetPieceHop | null> {
  const originLabel = input.originLabel ?? ""
  const distances = hopDistances(input.connections, input.origins)
  const lens: Record<string, ZoneSetPieceHop | null> = {}
  for (const [zoneId, distance] of Object.entries(distances)) {
    lens[zoneId] =
      distance === 0
        ? { label: originLabel, origin: true }
        : { label: String(distance), origin: false }
  }
  return lens
}
