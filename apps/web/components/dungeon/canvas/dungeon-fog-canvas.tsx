"use client"

import "@xyflow/react/dist/style.css"

import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import { type DungeonSnapshot } from "@workspace/game/engine"

import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "./dungeon-connection-edge"
import {
  DungeonFogZoneNode,
  type DungeonFogZoneNode as DungeonFogZoneNodeType,
} from "./dungeon-fog-zone-node"

const nodeTypes = { fogZone: DungeonFogZoneNode }
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

function buildNodes(
  snapshot: DungeonSnapshot,
  ownedCharacterIds: Set<string>
): DungeonFogZoneNodeType[] {
  const exitsByZone: Record<string, DungeonSnapshot["exits"]> = {}
  for (const exit of snapshot.exits) {
    ;(exitsByZone[exit.zoneId] ??= []).push(exit)
  }

  return snapshot.zones.map((zone) => ({
    id: zone.id,
    type: "fogZone",
    position: zone.position,
    draggable: false,
    data: {
      name: zone.name,
      description: zone.description,
      tokens: zone.tokens.map((token) => ({
        ...token,
        owned: ownedCharacterIds.has(token.characterId),
      })),
      exits: (exitsByZone[zone.id] ?? []).map((exit) => ({
        id: exit.id,
        locked: exit.locked,
      })),
    },
  }))
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
 * console's {@link import("./dungeon-canvas").DungeonCanvas}. It can only ever draw
 * what the snapshot permits: revealed Zones (at their real positions) and revealed
 * connections; known-exit silhouettes ride as chips on the Zone cards, and
 * undiscovered Zones / hidden connections are simply not in the data.
 *
 * **Stay-put viewport** (PRD *Map Canvas & UX*): the board re-derives on every poll,
 * but `fitView` runs only on first mount — a reveal adds a Zone *without* yanking the
 * viewport. `<Controls>` offers manual recenter/zoom.
 */
export function DungeonFogCanvas(props: {
  snapshot: DungeonSnapshot
  ownedCharacterIds: string[]
}) {
  return (
    <ReactFlowProvider>
      <DungeonFogCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DungeonFogCanvasInner({
  snapshot,
  ownedCharacterIds,
}: {
  snapshot: DungeonSnapshot
  ownedCharacterIds: string[]
}) {
  const { resolvedTheme } = useTheme()
  const [nodes, setNodes, onNodesChange] =
    useNodesState<DungeonFogZoneNodeType>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])

  // Re-derive the board from each poll's snapshot. A reveal snaps the new Zone in;
  // the viewport stays put (fitView is init-only).
  useEffect(() => {
    setNodes(buildNodes(snapshot, new Set(ownedCharacterIds)))
    setEdges(buildEdges(snapshot))
  }, [snapshot, ownedCharacterIds, setNodes, setEdges])

  const isEmpty = snapshot.zones.length === 0

  return (
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
      panOnScroll
      panOnDrag
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      {isEmpty && (
        <Panel
          position="top-center"
          className="rounded-none border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm"
        >
          The party hasn&apos;t explored anywhere yet.
        </Panel>
      )}
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
