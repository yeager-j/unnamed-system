import {
  connectionFogState,
  isConnectionLocked,
  type MapInstanceState,
  type MapZone,
} from "@workspace/game-v2/spatial"

import { type DungeonConnectionEdge as DungeonConnectionEdgeType } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import { type DungeonZoneToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
  type DungeonRosterEntry,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import { connectionAriaLabel } from "@/components/shared/canvas/geometry-to-flow"
import type { RailRow, RosterView } from "@/domain/combat/view/roster-view"
import { zoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import { footprintOf } from "@/domain/map/view/footprints"

/** The party tokens standing in each Zone (play mode), keyed by Zone id. Tokens
 *  whose occupant isn't in the delve roster are dropped — during exploration the
 *  only such keys are leftover enemy-combatant tokens from a just-ended fight,
 *  pruned for real in UNN-469; rendering them as "Unknown" would mislead. Shared
 *  with the Edit-mode canvas (UNN-486), which draws the same chips as Zone overlays. */
export function tokensByZone(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): Record<string, DungeonZoneToken[]> {
  const byZone: Record<string, DungeonZoneToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    const entry = roster[characterId]
    if (!entry) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: entry.name,
      portraitUrl: entry.portraitUrl,
      hp: entry.hp,
      sp: entry.sp,
    })
  }
  return byZone
}

/** Re-derive the React Flow node array from the (optimistic) Instance — the
 *  {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas} runs this on
 *  every Instance change, keyed off the {@link DungeonCanvasMode}: the exploration
 *  **play** board or the combat battlefield (UNN-536). */
export function buildNodes(
  instance: MapInstanceState,
  mode: DungeonCanvasMode
): CanvasNode[] {
  return mode.kind === "combat"
    ? buildCombatNodes(instance, mode.roster)
    : buildPlayNodes(instance, mode.roster)
}

function buildPlayNodes(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): CanvasNode[] {
  const byZone = tokensByZone(instance, roster)
  return Object.values(instance.geometry.zones).map((zone) => {
    const { w, h } = footprintOf(zone.size)
    return {
      id: zone.id,
      type: "dungeonZone",
      position: zone.position,
      draggable: false,
      width: w,
      height: h,
      style: { width: w, height: h },
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
        tokens: byZone[zone.id] ?? [],
      },
    }
  })
}

/** The combatants standing in each Zone (combat mode), keyed by Zone id — grouped
 *  from the console {@link RosterView} by their live occupancy. Shared by the
 *  battlefield node build and the roster inspector, which rebuilds one zone's view. */
export function rowsByZone(
  instance: MapInstanceState,
  roster: RosterView
): Record<string, RailRow[]> {
  const byZone: Record<string, RailRow[]> = {}
  for (const row of [...roster.players, ...roster.enemies]) {
    const zoneId = instance.occupancy[row.id]?.zoneId
    if (zoneId === undefined) continue
    ;(byZone[zoneId] ??= []).push(row)
  }
  return byZone
}

/** The combat battlefield's nodes: each authored Zone with the combatants standing
 *  in it (grouped from the console {@link RosterView} by their occupancy zone), the
 *  both-sides-present **Engaged** flag, and the Zone's Bard Enchantment badge. The
 *  acting highlight + move affordances are read from the canvas context per node,
 *  not baked here. */
function buildCombatNodes(
  instance: MapInstanceState,
  roster: RosterView
): CanvasNode[] {
  const byZone = rowsByZone(instance, roster)

  return Object.values(instance.geometry.zones).map((zone: MapZone) => {
    const rows = byZone[zone.id] ?? []
    const { w, h } = footprintOf(zone.size)
    return {
      id: zone.id,
      type: "dungeonCombatZone",
      position: zone.position,
      draggable: false,
      width: w,
      height: h,
      style: { width: w, height: h },
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
        rows,
        enchantment: zoneEnchantmentBadge(instance.enchantment, zone.id),
      },
    }
  })
}

/** The Instance's connections as read-only rim-threshold floating edges. Not
 *  selectable (the console selects zones, not connections) but focusable, so the
 *  notches keep keyboard reach + pairing glow. */
export function buildEdges(
  instance: MapInstanceState
): DungeonConnectionEdgeType[] {
  return Object.values(instance.geometry.connections).map((connection) => {
    const fromName = instance.geometry.zones[connection.fromZoneId]?.name ?? ""
    const toName = instance.geometry.zones[connection.toZoneId]?.name ?? ""
    const locked = isConnectionLocked(connection, instance.reveal)
    return {
      id: connection.id,
      type: "dungeonConnection",
      source: connection.fromZoneId,
      target: connection.toZoneId,
      selectable: false,
      focusable: true,
      ariaLabel: connectionAriaLabel(fromName, toName, {
        hidden: connection.hidden,
        locked,
      }),
      data: {
        fog: connectionFogState(connection, instance.reveal),
        locked,
        // The authored secret flag — distinct from the fog state, so the DM can
        // tell a deliberately-hidden passage apart from one players just haven't
        // discovered yet (which auto-surfaces as a silhouette on reveal).
        hidden: connection.hidden,
        fromName,
        toName,
      },
    }
  })
}
