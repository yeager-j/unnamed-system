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
import { useEffect, type ReactNode } from "react"

import type { MapInstanceState } from "@workspace/game/foundation"

import { buildEdges, buildNodes } from "@/components/dungeon/canvas/build-nodes"
import { DungeonCombatZoneNode } from "@/components/dungeon/canvas/combat/zone-node"
import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "@/components/dungeon/canvas/connection-edge"
import { TurnLoopBar } from "@/components/dungeon/canvas/explore/turn-loop-bar"
import { DungeonZoneNode } from "@/components/dungeon/canvas/explore/zone-node"
import { DungeonSetupZoneNode } from "@/components/dungeon/canvas/setup/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
} from "@/components/dungeon/canvas/types"
import {
  readViewport,
  writeViewport,
} from "@/components/dungeon/canvas/viewport-store"
import { CanvasEmptyNotice } from "@/components/shared/canvas/canvas-empty-notice"
import {
  CANVAS_DOT_SIZE,
  CANVAS_GRID_SIZE,
} from "@/components/shared/canvas/grid"

const nodeTypes = {
  dungeonZone: DungeonZoneNode,
  dungeonCombatZone: DungeonCombatZoneNode,
  dungeonSetupZone: DungeonSetupZoneNode,
}
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

/**
 * The DM run console's shared map canvas (UNN-464 / UNN-467) — one controlled
 * React Flow surface for the exploration **play** board, the **combat** battlefield,
 * and the **setup** picker, branched by {@link DungeonCanvasMode}. It re-derives its
 * nodes/edges from the **optimistic** {@link MapInstanceState} (and the shaped combat
 * layout) on every change via {@link buildNodes}/{@link buildEdges}, so a
 * move/reveal/turn re-lays the board with no extra state. Zones are fixed cards;
 * connections are read-only fog-styled floating edges. The bottom `bar` (the play
 * {@link TurnLoopBar} or the combat panels) renders **inside** the flow as a Panel so
 * it can own the zoom controls; its dispatchers come from the context the run console
 * provides above the canvas.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  mode: DungeonCanvasMode
  bar?: ReactNode
  /** Persists zoom/pan across phase remounts, keyed by the dungeon's `shortId` —
   *  see {@link import("@/components/dungeon/canvas/viewport-store").readViewport}. */
  persistKey?: string
}) {
  return (
    <ReactFlowProvider>
      <DungeonCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function DungeonCanvasInner({
  instance,
  mode,
  bar,
  persistKey,
}: {
  instance: MapInstanceState
  mode: DungeonCanvasMode
  bar?: ReactNode
  persistKey?: string
}) {
  const { resolvedTheme } = useTheme()
  // Restore the last zoom/pan for this dungeon (or fit the board on the first
  // visit); a phase switch remounts this canvas, so this is what keeps it steady.
  const storedViewport = persistKey ? readViewport(persistKey) : undefined
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])

  // Re-derive the board from the (optimistic) Instance whenever it changes — a
  // move/reveal/turn snaps tokens + reveal badges to the new truth.
  useEffect(() => {
    setNodes(buildNodes(instance, mode))
    setEdges(buildEdges(instance))
  }, [instance, mode, setNodes, setEdges])

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
      defaultViewport={storedViewport}
      fitView={storedViewport === undefined}
      fitViewOptions={{ padding: 0.2 }}
      onMoveEnd={
        persistKey
          ? (_, viewport) => writeViewport(persistKey, viewport)
          : undefined
      }
      proOptions={{ hideAttribution: true }}
      panOnScroll
      selectionOnDrag
      panOnDrag={false}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={CANVAS_GRID_SIZE}
        size={CANVAS_DOT_SIZE}
      />
      {isEmpty && (
        <CanvasEmptyNotice>
          This dungeon has no map yet — author it on My Maps, then recreate the
          delve.
        </CanvasEmptyNotice>
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
          Hidden (secret)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 border border-dotted border-muted-foreground/60 opacity-60" />
          Not yet revealed
        </span>
      </Panel>

      {bar ?? <TurnLoopBar />}
    </ReactFlow>
  )
}
