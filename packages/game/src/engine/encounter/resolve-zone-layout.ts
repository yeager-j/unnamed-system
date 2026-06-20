import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantDisplayNames } from "@workspace/game/engine/encounter/console-view"
import { getEnchantment } from "@workspace/game/engine/encounter/enchantment"
import { engagedWith } from "@workspace/game/engine/encounter/engagement-graph"
import {
  enemyHp,
  pcPool,
  type PcCombatantDetail,
  type Pool,
} from "@workspace/game/engine/encounter/roster-view"
import { adjacentZones } from "@workspace/game/engine/encounter/zone-graph"
import {
  forteMarking,
  type EnchantmentType,
  type ZoneEnchantment,
} from "@workspace/game/foundation/combat/enchantment"
import { type Engagement } from "@workspace/game/foundation/combat/engagement"
import { type MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type {
  Combatant,
  CombatSession,
  CombatSide,
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
  /** Current/max HP, so the map token can draw a health bar (UNN-489). A PC's
   *  pools come from its hydrated detail, an enemy's from its working HP. */
  hp: Pool
  /** Current/max SP — `null` for enemies (5e stat blocks carry no SP resource),
   *  so only PC tokens draw the second bar. */
  sp: Pool | null
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
 *  adjacency legend), the tokens currently in it, its Enchantment badge when the
 *  session's singleton Enchantment sits on this zone, and whether it is
 *  **Engaged** (both sides stand here — rulebook §3.5). */
export interface ZoneLayoutEntry {
  id: string
  name: string
  adjacentZoneNames: string[]
  combatants: ZoneToken[]
  enchantment?: ZoneEnchantmentBadge
  engaged: boolean
}

/** A zone reads **Engaged** when both sides occupy it (rulebook §3.5) — derived
 *  here (not in the UI) so the rule lives in one place. Populated by both the DM
 *  layout and the player view's {@link
 *  import("./resolve-player-view").resolvePlayerZoneLayout}; currently consumed
 *  only by the dungeon combat canvas (`DungeonCombatZoneNode`). */
export function zoneIsEngaged(combatants: ZoneToken[]): boolean {
  return (
    combatants.some((token) => token.side === "players") &&
    combatants.some((token) => token.side === "enemies")
  )
}

/**
 * Partitions a zone's tokens into engagement **clusters** — the connected
 * components of the same-zone melee-lock graph (engagement is symmetric, so a
 * cluster is a set of tokens reachable through each other's locks). Each token
 * appears in exactly one returned group; a Free token, or one whose only partner
 * has left the zone, comes back as a singleton, so the call site is one uniform
 * map. The combat zone card rings the multi-member clusters with the dotted
 * "engaged" outline.
 *
 * Generic over any token carrying an `id` + optional `engagement` — the DM
 * combat card's {@link ZoneToken} and the fog view's party/enemy tokens (whose
 * `engagement.targetCombatantIds` reference the same ids these tokens key on)
 * both qualify. A token with `engagement` absent (Free, or never set)
 * contributes no edges, and any target not present in `tokens` (a partner who
 * moved away) or a self-link is dropped. Order is preserved — groups appear in
 * the order their first member appears, members keep their input order.
 */
export function groupTokensByEngagement<
  T extends { id: string; engagement?: Engagement },
>(tokens: T[]): T[][] {
  const byId = new Map(tokens.map((token) => [token.id, token]))
  const indexById = new Map(tokens.map((token, index) => [token.id, index]))
  const neighbors = (token: T): string[] =>
    (token.engagement
      ? engagedWith({ engagement: token.engagement })
      : []
    ).filter((id) => id !== token.id && byId.has(id))

  const visited = new Set<string>()
  const groups: T[][] = []

  for (const seed of tokens) {
    if (visited.has(seed.id)) continue
    const group: T[] = []
    const stack = [seed]
    visited.add(seed.id)
    while (stack.length > 0) {
      const current = stack.pop()!
      group.push(current)
      for (const id of neighbors(current)) {
        if (visited.has(id)) continue
        visited.add(id)
        stack.push(byId.get(id)!)
      }
    }
    group.sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!)
    groups.push(group)
  }

  return groups
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
 * The whole battlefield: one entry per zone (in `instance.zones` insertion order),
 * the `unplaced` overflow (combatants whose `zoneId` isn't a current zone — the
 * empty-string default or a stale id), and `hasZones` so the component can show
 * the unzoned / theater-of-mind state instead of an empty grid.
 */
export interface ZoneLayoutView {
  zones: ZoneLayoutEntry[]
  unplaced: ZoneToken[]
  hasZones: boolean
}

/** Projects a combatant to its battlefield token. A PC draws its portrait + pools
 *  from the injected detail; an enemy has no portrait (the initials-square
 *  fallback), its working HP, and no SP. `name` is the caller's disambiguated
 *  label ({@link combatantDisplayNames}) so duplicate enemies number consistently
 *  with the rail and the player view. */
function zoneToken(
  combatant: Combatant,
  engagement: Engagement,
  name: string,
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): ZoneToken {
  const ref = combatant.ref
  const isPc = ref.kind === "pc"
  const pcDetail = ref.kind === "pc" ? pcDetailById[ref.characterId] : undefined

  return {
    id: combatant.id,
    name,
    side: combatant.side,
    isPc,
    portraitUrl: pcDetail?.portraitUrl ?? null,
    hp: isPc ? pcPool(pcDetail, "hp") : enemyHp(combatant, enemyStatblockById),
    // Stryker disable next-line StringLiteral: equivalent — pcPool returns the SP pool for any non-"hp" kind.
    sp: isPc ? pcPool(pcDetail, "sp") : null,
    engagement,
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
  instance: MapInstanceState,
  pcDetailById: Record<string, PcCombatantDetail>,
  enemyStatblockById: Record<string, Statblock>
): ZoneLayoutView {
  const zoneEntries = Object.values(instance.geometry.zones)
  const zoneIds = new Set(zoneEntries.map((zone) => zone.id))
  const nameById = combatantDisplayNames(
    session,
    pcDetailById,
    enemyStatblockById
  )

  const tokenOf = (combatant: Combatant) =>
    zoneToken(
      combatant,
      instance.occupancy[combatant.id]?.engagement ?? { status: "free" },
      nameById.get(combatant.id) ?? combatant.id,
      pcDetailById,
      enemyStatblockById
    )

  const zones = zoneEntries.map((zone) => {
    const combatants = session.combatants
      .filter(
        (combatant) => instance.occupancy[combatant.id]?.zoneId === zone.id
      )
      .map(tokenOf)
    return {
      id: zone.id,
      name: zone.name,
      adjacentZoneNames: adjacentZones(instance, zone.id).map((z) => z.name),
      combatants,
      enchantment: zoneEnchantmentBadge(instance.enchantment, zone.id),
      engaged: zoneIsEngaged(combatants),
    }
  })

  const unplaced = session.combatants
    .filter(
      (combatant) =>
        !zoneIds.has(instance.occupancy[combatant.id]?.zoneId ?? "")
    )
    .map(tokenOf)

  return { zones, unplaced, hasZones: zoneEntries.length > 0 }
}
