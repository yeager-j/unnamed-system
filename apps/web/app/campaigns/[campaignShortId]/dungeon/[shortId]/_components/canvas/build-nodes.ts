import {
  connectionFogState,
  isConnectionLocked,
  type MapInstanceState,
  type MapZone,
} from "@workspace/game-v2/spatial"

import { type DungeonCombatToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/zone-node"
import { type DungeonConnectionEdge as DungeonConnectionEdgeType } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import { type DungeonZoneToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
  type DungeonRosterEntry,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import type { RailRow, RosterView } from "@/domain/combat/view/roster-view"
import { zoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"

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
  return Object.values(instance.geometry.zones).map((zone) => ({
    id: zone.id,
    type: "dungeonZone",
    position: zone.position,
    draggable: false,
    data: {
      zone,
      revealed: instance.reveal.revealedZoneIds.includes(zone.id),
      tokens: byZone[zone.id] ?? [],
    },
  }))
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
  const rowsByZone: Record<string, RailRow[]> = {}
  for (const row of [...roster.players, ...roster.enemies]) {
    const zoneId = instance.occupancy[row.id]?.zoneId
    if (zoneId === undefined) continue
    ;(rowsByZone[zoneId] ??= []).push(row)
  }

  return Object.values(instance.geometry.zones).map((zone: MapZone) => {
    const tokens: DungeonCombatToken[] = (rowsByZone[zone.id] ?? []).map(
      (row) => ({
        id: row.id,
        name: row.name,
        side: row.side,
        portraitUrl: row.portraitUrl,
        hp: row.hp,
        sp: row.sp,
        engaged: row.engagement.status === "engaged",
      })
    )
    const sides = new Set(tokens.map((token) => token.side))
    return {
      id: zone.id,
      type: "dungeonCombatZone",
      position: zone.position,
      draggable: false,
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
        tokens,
        engaged: sides.has("players") && sides.has("enemies"),
        enchantment: zoneEnchantmentBadge(instance.enchantment, zone.id),
      },
    }
  })
}

/** The Instance's connections as read-only fog-styled floating edges. */
export function buildEdges(
  instance: MapInstanceState
): DungeonConnectionEdgeType[] {
  return Object.values(instance.geometry.connections).map((connection) => ({
    id: connection.id,
    type: "dungeonConnection",
    source: connection.fromZoneId,
    target: connection.toZoneId,
    selectable: false,
    data: {
      fog: connectionFogState(connection, instance.reveal),
      locked: isConnectionLocked(connection, instance.reveal),
      // The authored secret flag — distinct from the fog state, so the DM can
      // tell a deliberately-hidden passage apart from one players just haven't
      // discovered yet (which auto-surfaces as a silhouette on reveal).
      hidden: connection.hidden,
    },
  }))
}
