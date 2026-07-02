import { connectionFogState, isConnectionLocked } from "@workspace/game/engine"
import type { MapInstanceState } from "@workspace/game/foundation"

import { type DungeonConnectionEdge as DungeonConnectionEdgeType } from "@/components/dungeon/canvas/connection-edge"
import { type DungeonZoneToken } from "@/components/dungeon/canvas/explore/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
  type DungeonRosterEntry,
} from "@/components/dungeon/canvas/types"

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
 *  {@link import("@/components/dungeon/canvas/canvas").DungeonCanvas} runs this on
 *  every Instance change. Only the play (exploration) board remains; the combat
 *  and setup node builders return with dungeon combat on engine v2 (PR11d). */
export function buildNodes(
  instance: MapInstanceState,
  mode: DungeonCanvasMode
): CanvasNode[] {
  const byZone = tokensByZone(instance, mode.roster)
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
