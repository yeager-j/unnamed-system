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
  DungeonZoneNode,
  type DungeonZoneNode as DungeonZoneNodeType,
  type DungeonZoneToken,
} from "./dungeon-zone-node"
import { TurnLoopBar } from "./turn-loop-bar"

const nodeTypes = { dungeonZone: DungeonZoneNode }
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

export interface DungeonRosterEntry {
  name: string
  portraitUrl: string | null
}

type CanvasNode = DungeonZoneNodeType

/** The party tokens standing in each Zone, keyed by Zone id, in occupancy order. */
function tokensByZone(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): Record<string, DungeonZoneToken[]> {
  const byZone: Record<string, DungeonZoneToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: roster[characterId]?.name ?? "Unknown",
      portraitUrl: roster[characterId]?.portraitUrl ?? null,
    })
  }
  return byZone
}

function buildNodes(
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
 * - **Zones** are fixed (non-draggable) cards showing their reveal state and the
 *   party tokens standing in them. Selecting one reveals a floating toolbar
 *   (reveal/hide ▸ move party here ▸ open details) — wired through the
 *   {@link useDungeonCanvas} context the run console provides.
 * - **Connections** are read-only floating edges (shared routing with the editor),
 *   styled by their player-facing fog/lock state.
 * - The {@link TurnLoopBar} renders **inside** the flow as a Panel so it can own the
 *   zoom controls; it too reads the run console's context.
 *
 * The canvas itself is presentational — it takes only the board data (`instance` +
 * `roster`); every dispatcher comes from the context above it.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
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
}: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
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

  const isEmpty = Object.keys(instance.geometry.zones).length === 0

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
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      deleteKeyCode={null}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      panOnScroll
      selectionOnDrag
      panOnDrag={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      {isEmpty && (
        <Panel
          position="top-center"
          className="rounded-none border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm"
        >
          This dungeon has no map yet — author it on My Maps, then recreate the
          delve.
        </Panel>
      )}
      <Panel
        position="top-left"
        className="flex flex-col gap-1 rounded-none border bg-background/80 px-2 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 border border-border bg-card" />
          Revealed to players
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 border border-dashed border-muted-foreground" />
          Hidden from players
        </span>
      </Panel>

      <TurnLoopBar />
    </ReactFlow>
  )
}
