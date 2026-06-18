"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import { connectionFogState, isConnectionLocked } from "@workspace/game/engine"
import type { MapInstanceState } from "@workspace/game/foundation"

import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "./dungeon-connection-edge"
import {
  DungeonTokenNode,
  type DungeonTokenNode as DungeonTokenNodeType,
} from "./dungeon-token-node"
import {
  DungeonZoneNode,
  type DungeonZoneNode as DungeonZoneNodeType,
} from "./dungeon-zone-node"

const nodeTypes = {
  dungeonZone: DungeonZoneNode,
  dungeonToken: DungeonTokenNode,
}
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

export interface DungeonRosterEntry {
  name: string
  portraitUrl: string | null
}

type CanvasNode = DungeonZoneNodeType | DungeonTokenNodeType

/** Lays out a Zone's occupant tokens in a 2-wide grid just below the Zone card. */
function tokenPosition(
  base: { x: number; y: number },
  index: number
): { x: number; y: number } {
  return {
    x: base.x + (index % 2) * 100,
    y: base.y + 52 + Math.floor(index / 2) * 28,
  }
}

function buildNodes(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): CanvasNode[] {
  const zoneNodes: CanvasNode[] = Object.values(instance.geometry.zones).map(
    (zone) => ({
      id: zone.id,
      type: "dungeonZone",
      position: zone.position,
      draggable: false,
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
      },
    })
  )

  const byZone: Record<string, string[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    ;(byZone[token.zoneId] ??= []).push(characterId)
  }

  const tokenNodes: CanvasNode[] = []
  for (const [zoneId, characterIds] of Object.entries(byZone)) {
    const base = instance.geometry.zones[zoneId]?.position ?? { x: 0, y: 0 }
    characterIds.forEach((characterId, index) => {
      tokenNodes.push({
        id: `token-${characterId}`,
        type: "dungeonToken",
        position: tokenPosition(base, index),
        draggable: true,
        data: {
          characterId,
          name: roster[characterId]?.name ?? "Unknown",
          portraitUrl: roster[characterId]?.portraitUrl ?? null,
        },
      })
    })
  }

  return [...zoneNodes, ...tokenNodes]
}

/**
 * The Zone a dropped token snaps to: the nearest Zone center to the token's
 * center (top-left coords nudged to rough centers), or `null` when the drop lands
 * far from every Zone (an empty-canvas drop — snap back). Distance-based, not rect
 * intersection, so a near-miss still lands (the engine guides-not-blocks anyway).
 */
function nearestZoneId(
  instance: MapInstanceState,
  tokenPosition: { x: number; y: number }
): string | null {
  const tx = tokenPosition.x + 50
  const ty = tokenPosition.y + 14
  let best: string | null = null
  let bestDistance = Infinity
  for (const zone of Object.values(instance.geometry.zones)) {
    const dx = tx - (zone.position.x + 60)
    const dy = ty - (zone.position.y + 22)
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = zone.id
    }
  }
  return bestDistance <= 200 * 200 ? best : null
}

function buildEdges(instance: MapInstanceState): DungeonConnectionEdgeType[] {
  return Object.values(instance.geometry.connections).map((connection) => ({
    id: connection.id,
    type: "dungeonConnection",
    source: connection.fromZoneId,
    target: connection.toZoneId,
    selectable: false,
    data: {
      fog: connectionFogState(connection, instance.reveal),
      locked: isConnectionLocked(connection, instance.reveal),
    },
  }))
}

/**
 * The DM run console's Play-mode map (UNN-464) — a dedicated controlled React Flow
 * canvas (the template `MapCanvas` stays the uncontrolled editor; in-console
 * geometry editing is UNN-486). It derives its nodes/edges from the **optimistic**
 * {@link MapInstanceState} on every change, so a move or reveal re-lays the board
 * with no extra state:
 *
 * - **Zones** are fixed (non-draggable) cards showing their reveal state; clicking
 *   one fires `onSelectZone` → the host opens the Zone details sheet.
 * - **Connections** are read-only floating edges (shared routing with the editor),
 *   styled by their player-facing fog/lock state.
 * - **Tokens** are draggable PC chips; dropping one onto a Zone fires `onMoveToken`
 *   (the engine guides-not-blocks — any Zone is accepted, the party can split). A
 *   drop landing on no Zone snaps back.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onMoveToken: (characterId: string, toZoneId: string) => void
  onSelectZone: (zoneId: string) => void
}) {
  return (
    <ReactFlowProvider>
      <DungeonCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DungeonCanvasInner({
  instance,
  roster,
  onMoveToken,
  onSelectZone,
}: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onMoveToken: (characterId: string, toZoneId: string) => void
  onSelectZone: (zoneId: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])

  // Re-derive the board from the (optimistic) Instance whenever it changes — a
  // move/reveal snaps tokens + reveal badges to the new truth.
  useEffect(() => {
    setNodes(buildNodes(instance, roster))
    setEdges(buildEdges(instance))
  }, [instance, roster, setNodes, setEdges])

  const handleNodeDragStop: OnNodeDrag<CanvasNode> = (_, node) => {
    if (node.type !== "dungeonToken") return
    const target = nearestZoneId(instance, node.position)
    if (!target) {
      setNodes(buildNodes(instance, roster)) // snap back
      return
    }
    onMoveToken(node.data.characterId, target)
  }

  const handleNodeClick: NodeMouseHandler<CanvasNode> = (_, node) => {
    if (node.type === "dungeonZone") onSelectZone(node.data.zone.id)
  }

  const isEmpty = Object.keys(instance.geometry.zones).length === 0

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={handleNodeDragStop}
      onNodeClick={handleNodeClick}
      nodesConnectable={false}
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      {isEmpty && (
        <Panel
          position="top-center"
          className="rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm"
        >
          This dungeon has no map yet — author it on My Maps, then recreate the
          delve.
        </Panel>
      )}
      <Panel
        position="bottom-left"
        className="flex flex-col gap-1 rounded-md border bg-background/80 px-2 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-xs border border-border bg-card" />
          Revealed to players
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-xs border border-dashed border-muted-foreground" />
          Hidden from players
        </span>
      </Panel>
    </ReactFlow>
  )
}
