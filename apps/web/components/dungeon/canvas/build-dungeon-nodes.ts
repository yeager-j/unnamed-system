import {
  connectionFogState,
  isConnectionLocked,
  type ZoneLayoutView,
} from "@workspace/game/engine"
import type { MapInstanceState } from "@workspace/game/foundation"

import {
  type CanvasNode,
  type DungeonCanvasMode,
  type DungeonRosterEntry,
} from "./dungeon-canvas-types"
import { type DungeonConnectionEdge as DungeonConnectionEdgeType } from "./dungeon-connection-edge"
import { type DungeonSetupZoneToken } from "./dungeon-setup-token-chip"
import { type DungeonZoneToken } from "./dungeon-zone-node"

/** The party tokens standing in each Zone (play mode), keyed by Zone id. Tokens
 *  whose occupant isn't in the delve roster are dropped — during exploration the
 *  only such keys are leftover enemy-combatant tokens from a just-ended fight,
 *  pruned for real in UNN-469; rendering them as "Unknown" would mislead. */
function tokensByZone(
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

function buildCombatNodes(
  instance: MapInstanceState,
  layout: ZoneLayoutView
): CanvasNode[] {
  const byZone = new Map(layout.zones.map((zone) => [zone.id, zone]))
  return Object.values(instance.geometry.zones).map((zone) => {
    const entry = byZone.get(zone.id)
    return {
      id: zone.id,
      type: "dungeonCombatZone",
      position: zone.position,
      draggable: false,
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
        tokens: entry?.combatants ?? [],
        // Engaged is a game rule (rulebook §3.5) — derived in the engine's
        // ZoneLayoutView, not here (CLAUDE.md: no game logic in the UI layer).
        engaged: entry?.engaged ?? false,
        enchantment: entry?.enchantment,
      },
    }
  })
}

function buildSetupNodes(
  instance: MapInstanceState,
  tokensByZone: Record<string, DungeonSetupZoneToken[]>
): CanvasNode[] {
  return Object.values(instance.geometry.zones).map((zone) => ({
    id: zone.id,
    type: "dungeonSetupZone",
    position: zone.position,
    draggable: false,
    data: {
      zone,
      revealed: instance.reveal.revealedZoneIds.includes(zone.id),
      tokens: tokensByZone[zone.id] ?? [],
    },
  }))
}

/** Re-derive the React Flow node array from the (optimistic) Instance for the
 *  active phase — the {@link import("./dungeon-canvas").DungeonCanvas} runs this on
 *  every Instance change. */
export function buildNodes(
  instance: MapInstanceState,
  mode: DungeonCanvasMode
): CanvasNode[] {
  switch (mode.kind) {
    case "play":
      return buildPlayNodes(instance, mode.roster)
    case "combat":
      return buildCombatNodes(instance, mode.layout)
    case "setup":
      return buildSetupNodes(instance, mode.tokensByZone)
  }
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
