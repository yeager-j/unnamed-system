import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantName } from "@workspace/game/engine/encounter/console-view"
import { getEnchantment } from "@workspace/game/engine/encounter/enchantment"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import { adjacentZones } from "@workspace/game/engine/encounter/zone-graph"
import {
  forteMarking,
  type EnchantmentType,
  type ZoneEnchantment,
} from "@workspace/game/foundation/combat/enchantment"
import type {
  Combatant,
  CombatSession,
  CombatSide,
  Engagement,
} from "@workspace/game/foundation/encounter/session"

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
  /** The combatant's melee-lock, for the UNN-316 token slot. **Optional** so the
   *  redacted player snapshot — which carries no `Engagement` object — can feed
   *  the same {@link ZoneLayoutView} (the grid ignores it; the future map ticket
   *  populates it from both sides). The DM shaper always sets it. */
  engagement?: Engagement
}

/** One rule line in the badge tooltip: the Forte that grants it, its rule
 *  text, and whether the Zone's current Forte has reached it (a Forte grants
 *  its own line and all lower Fortes'). */
export interface ForteLine {
  forte: number
  text: string
  active: boolean
}

/** The zone's active Enchantment as the badge renders it: the type key (for
 *  styling/tests), its resolved display name, the current Forte with its
 *  dynamic `marking` (*f / ff / fff*), and the per-Forte rule lines for the
 *  badge tooltip. */
export interface ZoneEnchantmentBadge {
  type: EnchantmentType
  name: string
  forte: number
  marking: string
  lines: ForteLine[]
}

/** One zone region: its name, the ids→names of the zones it borders (for the
 *  adjacency legend), the tokens currently in it, and its Enchantment badge
 *  when the session's singleton Enchantment sits on this zone. */
export interface ZoneLayoutEntry {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: ZoneToken[]
  enchantment?: ZoneEnchantmentBadge
}

/** The {@link ZoneEnchantmentBadge} for `zoneId`, or `undefined` when the
 *  session's Enchantment is absent or sits elsewhere. Shared by the DM shaper
 *  below and the watch view's {@link import("./resolve-player-view").resolvePlayerZoneLayout}. */
export function zoneEnchantmentBadge(
  enchantment: ZoneEnchantment | null,
  zoneId: string
): ZoneEnchantmentBadge | undefined {
  if (!enchantment || enchantment.zoneId !== zoneId) return undefined
  const definition = getEnchantment(enchantment.type)
  return {
    type: enchantment.type,
    name: definition.name,
    forte: enchantment.forte,
    marking: forteMarking(enchantment.forte),
    lines: definition.forteLines.map((text, index) => ({
      forte: index + 1,
      text,
      active: index + 1 <= enchantment.forte,
    })),
  }
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
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): ZoneToken {
  const ref = combatant.ref
  const isPc = ref.kind === "pc"
  const portraitUrl =
    ref.kind === "pc"
      ? (pcDetailById[ref.characterId]?.portraitUrl ?? null)
      : null

  return {
    id: combatant.id,
    name: combatantName(combatant, pcDetailById, enemyStatblockById),
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
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): ZoneLayoutView {
  const zoneEntries = Object.values(session.zones)
  const zoneIds = new Set(zoneEntries.map((zone) => zone.id))

  const zones = zoneEntries.map((zone) => ({
    id: zone.id,
    name: zone.name,
    adjacentZoneNames: adjacentZones(session, zone.id).map((z) => z.name),
    combatants: session.combatants
      .filter((combatant) => combatant.zoneId === zone.id)
      .map((combatant) =>
        zoneToken(combatant, pcDetailById, enemyStatblockById)
      ),
    enchantment: zoneEnchantmentBadge(session.enchantment, zone.id),
  }))

  const unplaced = session.combatants
    .filter((combatant) => !zoneIds.has(combatant.zoneId))
    .map((combatant) => zoneToken(combatant, pcDetailById, enemyStatblockById))

  return { zones, unplaced, hasZones: zoneEntries.length > 0 }
}
