import { combatantName } from "./console-view"
import type { PcCombatantDetail } from "./roster-view"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  Engagement,
} from "./session"

/**
 * The read-only zone layout the battlefield renders (UNN-314): the spatial peer
 * of the rail's {@link import("./roster-view").RosterView}. Pure shaping over a
 * {@link CombatSession} + the injected PC details (a PC's name/portrait live on
 * its character row, ADR Decision 1) so the component runs no `.filter().map()`
 * of its own. The DM console and the player watch view (UNN-334) render the same
 * shape; this module never emits events — movement is UNN-315.
 */

/**
 * One combatant as a battlefield token: just enough to draw it (name, side, and
 * the PC-vs-enemy split that picks portrait-or-initials). `engagement` rides
 * along for the UNN-316 token slot; UNN-314 doesn't render it yet.
 */
export interface ZoneToken {
  id: string
  name: string
  side: CombatSide
  isPc: boolean
  portraitUrl: string | null
  engagement: Engagement
}

/** One zone region: its name, the ids→names of the zones it borders (for the
 *  adjacency legend), and the tokens currently in it. */
export interface ZoneLayoutEntry {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: ZoneToken[]
}

/**
 * The whole battlefield: one entry per zone (in `session.zones` insertion order),
 * the `unplaced` overflow (combatants whose `zoneId` isn't a current zone — the
 * empty-string default or a stale id), and `hasZones` so the component can show
 * the unzoned / theater-of-mind state instead of an empty grid.
 */
export interface ZoneLayoutView {
  zones: ZoneLayoutEntry[]
  unplaced: ZoneToken[]
  hasZones: boolean
}

/** Projects a combatant to its battlefield token. A PC draws its portrait from
 *  the injected detail; an enemy has none (the initials-square fallback). */
function zoneToken(
  combatant: Combatant,
  pcDetailById: Record<string, PcCombatantDetail>
): ZoneToken {
  const ref = combatant.ref
  const isPc = ref.kind === "pc"
  const portraitUrl =
    ref.kind === "pc"
      ? (pcDetailById[ref.characterId]?.portraitUrl ?? null)
      : null

  return {
    id: combatant.id,
    name: combatantName(combatant, pcDetailById),
    side: combatant.side,
    isPc,
    portraitUrl,
    engagement: combatant.engagement,
  }
}

/**
 * Shapes a {@link ZoneLayoutView} from the session: groups combatants under the
 * zone their `zoneId` references, resolves each zone's adjacency to display
 * names, and buckets the rest into `unplaced`. Pure — recomputed on every
 * optimistic session change, so a move (UNN-315) re-lays the board with no extra
 * state. Referential integrity isn't enforced (UNN-313): a `zoneId` with no
 * matching zone simply lands its combatant in `unplaced`.
 */
export function resolveZoneLayout(
  session: CombatSession,
  pcDetailById: Record<string, PcCombatantDetail>
): ZoneLayoutView {
  const zoneEntries = Object.values(session.zones)
  const zoneIds = new Set(zoneEntries.map((zone) => zone.id))

  const zones = zoneEntries.map((zone) => ({
    id: zone.id,
    name: zone.name,
    adjacentZoneNames: (session.adjacency[zone.id] ?? []).flatMap((id) => {
      const neighbor = session.zones[id]
      return neighbor ? [neighbor.name] : []
    }),
    combatants: session.combatants
      .filter((combatant) => combatant.zoneId === zone.id)
      .map((combatant) => zoneToken(combatant, pcDetailById)),
  }))

  const unplaced = session.combatants
    .filter((combatant) => !zoneIds.has(combatant.zoneId))
    .map((combatant) => zoneToken(combatant, pcDetailById))

  return { zones, unplaced, hasZones: zoneEntries.length > 0 }
}
