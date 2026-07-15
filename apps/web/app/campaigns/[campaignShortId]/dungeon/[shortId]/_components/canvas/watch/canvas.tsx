"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import { type DungeonSnapshot } from "@workspace/game-v2/visibility"

import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import {
  DungeonWatchCombatZoneNode,
  type DungeonWatchCombatZoneNode as DungeonWatchCombatZoneNodeType,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/combat-zone-node"
import {
  DungeonWatchZoneNode,
  type DungeonWatchZoneNode as DungeonWatchZoneNodeType,
  type WatchZoneExit,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/zone-node"
import { CanvasEmptyNotice } from "@/components/shared/canvas/canvas-empty-notice"
import {
  CANVAS_DOT_SIZE,
  CANVAS_GRID_SIZE,
} from "@/components/shared/canvas/grid"
import { useCanvasTier } from "@/components/shared/canvas/use-canvas-tier"
import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import { zoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import {
  watchCombatZoneView,
  watchExploreZoneView,
} from "@/domain/dungeon/view/set-piece-view"
import { footprintOf } from "@/domain/map/view/footprints"

const nodeTypes = {
  fogZone: DungeonWatchZoneNode,
  fogCombatZone: DungeonWatchCombatZoneNode,
}
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

/**
 * Which pieces the fog board carries — exploration party tokens (from the
 * dungeon snapshot itself) or the live fight's redacted combatants (the C3
 * join, UNN-604). The board is the dungeon snapshot in both: zones at their
 * real positions, fog, connections, exits, Enchantment.
 */
export type DungeonWatchCanvasMode =
  | { kind: "explore" }
  | { kind: "combat"; combatants: WatchCombatant[] }

type WatchCanvasNode = DungeonWatchZoneNodeType | DungeonWatchCombatZoneNodeType

/** Known-exit silhouettes keyed by their revealed endpoint. */
function exitsByZone(
  snapshot: DungeonSnapshot
): Record<string, WatchZoneExit[]> {
  const byZone: Record<string, WatchZoneExit[]> = {}
  for (const exit of snapshot.exits) {
    ;(byZone[exit.zoneId] ??= []).push({ id: exit.id, locked: exit.locked })
  }
  return byZone
}

function buildExploreNodes(
  snapshot: DungeonSnapshot,
  ownedCharacterIds: string[]
): WatchCanvasNode[] {
  const exits = exitsByZone(snapshot)

  return snapshot.zones.map((zone) => {
    const { w, h } = footprintOf(zone.size)
    return {
      id: zone.id,
      type: "fogZone" as const,
      position: zone.position,
      draggable: false,
      width: w,
      height: h,
      style: { width: w, height: h },
      data: {
        view: watchExploreZoneView({ zone, ownedCharacterIds }),
        exits: exits[zone.id] ?? [],
        // The snapshot carries the raw Enchantment (zoneId/type/forte); the badge
        // (name, forte marking, rule lines) is display shaping, done consumer-side.
        enchantment: zoneEnchantmentBadge(zone.enchantment ?? null, zone.id),
      },
    }
  })
}

/**
 * The C3 join (UNN-604): board zones from the **dungeon** snapshot, pieces from
 * the **encounter** snapshot's redacted combatants, matched by `zoneId`. A
 * combatant whose zone isn't a revealed board zone — fog-clamped to `""`, or
 * standing somewhere undiscovered — simply doesn't render; its presence still
 * shows in the enemies rail. The dungeon snapshot's own party tokens are
 * ignored here: every PC in the fight is also a combatant (a PC's participant
 * id *is* its `characterId`), so drawing both would double it.
 */
function buildCombatNodes(
  snapshot: DungeonSnapshot,
  combatants: WatchCombatant[],
  ownedCharacterIds: string[]
): WatchCanvasNode[] {
  const exits = exitsByZone(snapshot)
  const byZone: Record<string, WatchCombatant[]> = {}
  for (const combatant of combatants) {
    if (combatant.zoneId === null) continue
    ;(byZone[combatant.zoneId] ??= []).push(combatant)
  }

  return snapshot.zones.map((zone) => {
    const zoneCombatants = byZone[zone.id] ?? []
    const { w, h } = footprintOf(zone.size)
    return {
      id: zone.id,
      type: "fogCombatZone" as const,
      position: zone.position,
      draggable: false,
      width: w,
      height: h,
      style: { width: w, height: h },
      data: {
        view: watchCombatZoneView({
          zone,
          combatants: zoneCombatants,
          ownedCharacterIds,
        }),
        combatants: zoneCombatants,
        exits: exits[zone.id] ?? [],
        enchantment: zoneEnchantmentBadge(zone.enchantment ?? null, zone.id),
      },
    }
  })
}

/** Revealed connections (both endpoints discovered) as read-only floating edges,
 *  reusing the run console's edge — every player-visible edge is `revealed` fog. */
function buildEdges(snapshot: DungeonSnapshot): DungeonConnectionEdgeType[] {
  return snapshot.connections.map((connection) => ({
    id: connection.id,
    type: "dungeonConnection",
    source: connection.fromZoneId,
    target: connection.toZoneId,
    selectable: false,
    data: { fog: "revealed", locked: connection.locked },
  }))
}

/**
 * The **player fog map** (UNN-466) — a read-only React Flow canvas derived from the
 * server-redacted {@link DungeonSnapshot}, the public counterpart of the DM run
 * console's {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas}. It can only ever draw
 * what the snapshot permits: revealed Zones (at their real positions) and revealed
 * connections; known-exit silhouettes ride as chips on the Zone cards, and
 * undiscovered Zones / hidden connections are simply not in the data.
 *
 * During a delve fight the same board renders in **combat mode** (UNN-604): the
 * {@link DungeonWatchCanvasMode} swaps the party tokens for the live fight's
 * redacted combatants, joined onto the board by `zoneId`. The map stays the
 * battlefield across both phases — one canvas, two piece sets.
 *
 * **Stay-put viewport** (PRD *Map Canvas & UX*): the board re-derives on every poll,
 * but `fitView` runs only on first mount — a reveal adds a Zone *without* yanking the
 * viewport, and the explore ↔ combat swap keeps the pan/zoom (the canvas stays
 * mounted; only its nodes change). `<Controls>` offers manual recenter/zoom.
 */
export function DungeonWatchCanvas(props: {
  snapshot: DungeonSnapshot
  ownedCharacterIds: string[]
  mode: DungeonWatchCanvasMode
}) {
  return (
    <ReactFlowProvider>
      <DungeonWatchCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DungeonWatchCanvasInner({
  snapshot,
  ownedCharacterIds,
  mode,
}: {
  snapshot: DungeonSnapshot
  ownedCharacterIds: string[]
  mode: DungeonWatchCanvasMode
}) {
  const { resolvedTheme } = useTheme()
  const tier = useCanvasTier()
  const [nodes, setNodes, onNodesChange] = useNodesState<WatchCanvasNode>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])

  // Re-derive the board from each poll's snapshot. A reveal snaps the new Zone in;
  // the viewport stays put (fitView is init-only).
  useEffect(() => {
    setNodes(
      mode.kind === "combat"
        ? buildCombatNodes(snapshot, mode.combatants, ownedCharacterIds)
        : buildExploreNodes(snapshot, ownedCharacterIds)
    )
    setEdges(buildEdges(snapshot))
  }, [snapshot, ownedCharacterIds, mode, setNodes, setEdges])

  const isEmpty = snapshot.zones.length === 0

  return (
    <div className="relative size-full" data-tier={tier}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.6}
        // Wheel zooms across tiers (§D1); players pan on left-drag.
        zoomOnScroll
        panOnDrag
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={CANVAS_GRID_SIZE}
          size={CANVAS_DOT_SIZE}
        />
        {isEmpty && (
          <CanvasEmptyNotice>
            The party hasn&apos;t explored anywhere yet.
          </CanvasEmptyNotice>
        )}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
