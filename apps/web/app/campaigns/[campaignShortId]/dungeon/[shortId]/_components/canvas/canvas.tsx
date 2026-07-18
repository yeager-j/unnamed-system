"use client"

import "@xyflow/react/dist/style.css"

import { MapTrifoldIcon } from "@phosphor-icons/react/dist/ssr"
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"

import {
  buildEdges,
  buildNodes,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/build-nodes"
import { DungeonCombatZoneNode } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/zone-node"
import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import { DungeonStubGhostNode } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/stub-ghost-node"
import { TurnLoopBar } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/turn-loop-bar"
import { DungeonZoneNode } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import {
  readMinimapVisible,
  readViewport,
  writeMinimapVisible,
  writeViewport,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/viewport-store"
import { CanvasCartouche } from "@/components/shared/canvas/canvas-cartouche"
import { CanvasEmptyNotice } from "@/components/shared/canvas/canvas-empty-notice"
import {
  CanvasMinimap,
  type MinimapZoneClass,
} from "@/components/shared/canvas/canvas-minimap"
import {
  CANVAS_DOT_SIZE,
  CANVAS_GRID_SIZE,
} from "@/components/shared/canvas/grid"
import {
  HoveredConnectionProvider,
  useEdgeFocusPairing,
  useHoveredConnection,
} from "@/components/shared/canvas/hovered-connection-context"
import { prefersReducedMotion } from "@/components/shared/canvas/reduced-motion"
import { useCanvasTier } from "@/components/shared/canvas/use-canvas-tier"

const nodeTypes = {
  dungeonZone: DungeonZoneNode,
  dungeonCombatZone: DungeonCombatZoneNode,
  stubGhost: DungeonStubGhostNode,
}
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

/**
 * The DM run console's map canvas (UNN-464) — one controlled React Flow surface
 * for the exploration **play** board and the live **combat** battlefield
 * ({@link DungeonCanvasMode}; combat landed on engine v2 in UNN-536). It re-derives its
 * nodes/edges from the **optimistic** {@link MapInstanceState} on every change via
 * {@link buildNodes}/{@link buildEdges}, so a move/reveal/turn re-lays the board
 * with no extra state. Zones are fixed cards; connections are read-only fog-styled
 * floating edges. The bottom `bar` (the play {@link TurnLoopBar}) renders
 * **inside** the flow as a Panel so it can own the zoom controls; its dispatchers
 * come from the context the run console provides above the canvas.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  mode: DungeonCanvasMode
  /** The page the board shows (UNN-586) — one page at a time; the host owns the
   *  choice (sidebar switcher in explore, follow-the-turn in combat). Absent ⇒
   *  first page in canonical order. */
  activePageId?: string
  /** A chip navigation's landing request — center this Zone once its page's
   *  nodes are in. The `nonce` distinguishes repeat requests for the same Zone. */
  focusZone?: { zoneId: string; nonce: number } | null
  /** The dungeon's name — the cartouche title (§D8). */
  dungeonName: string
  /** The delve's turn counter — the cartouche subtitle on the DM console (the turn
   *  readout moved off the working bar). */
  turnCounter: number
  bar?: ReactNode
  /** A React Flow overlay rendered inside the flow (the roster inspector Panel). */
  overlay?: ReactNode
  /** A zone was clicked — the canvas has already centered on it; the body decides
   *  the inspector open/clear (occupied ? open : clear). */
  onZoneClick?: (zoneId: string) => void
  /** The empty pane was clicked — clears the inspector. */
  onPaneClick?: () => void
  /** Persists zoom/pan across phase remounts, keyed by the dungeon's `shortId` —
   *  see {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/viewport-store").readViewport}. */
  persistKey?: string
}) {
  return (
    <ReactFlowProvider>
      <HoveredConnectionProvider>
        <DungeonCanvasInner {...props} />
      </HoveredConnectionProvider>
    </ReactFlowProvider>
  )
}

function DungeonCanvasInner({
  instance,
  mode,
  activePageId,
  focusZone,
  dungeonName,
  turnCounter,
  bar,
  overlay,
  onZoneClick,
  onPaneClick,
  persistKey,
}: {
  instance: MapInstanceState
  mode: DungeonCanvasMode
  activePageId?: string
  focusZone?: { zoneId: string; nonce: number } | null
  dungeonName: string
  turnCounter: number
  bar?: ReactNode
  overlay?: ReactNode
  onZoneClick?: (zoneId: string) => void
  onPaneClick?: () => void
  persistKey?: string
}) {
  const { resolvedTheme } = useTheme()
  const tier = useCanvasTier()
  const { setCenter, getZoom } = useReactFlow()
  const { setHovered } = useHoveredConnection()
  // Click-to-center (§D1): focus and detail stay orthogonal, so centering keeps
  // the current zoom. Reduced motion collapses the ease. The body owns what the
  // click *means* for the inspector; the canvas just frames the zone.
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const w = node.measured?.width ?? node.width ?? 0
      const h = node.measured?.height ?? node.height ?? 0
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: getZoom(),
        duration: prefersReducedMotion() ? 0 : 200,
      })
      onZoneClick?.(node.id)
    },
    [setCenter, getZoom, onZoneClick]
  )
  // Restore the last zoom/pan for this dungeon (or fit the board on the first
  // visit); a phase switch remounts this canvas, so this is what keeps it steady.
  const storedViewport = persistKey ? readViewport(persistKey) : undefined
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])
  const edgeFocusPairing = useEdgeFocusPairing(edges)

  // Re-derive the board from the (optimistic) Instance whenever it changes — a
  // move/reveal/turn snaps tokens + reveal badges to the new truth; a page switch
  // refilters both halves (UNN-586).
  useEffect(() => {
    setNodes(buildNodes(instance, mode, activePageId))
    setEdges(buildEdges(instance, activePageId))
  }, [instance, mode, activePageId, setNodes, setEdges])

  // Land a chip navigation: once the far page's nodes are in, center the linked
  // Zone. The consumed nonce guards against re-centering on unrelated re-derives.
  const consumedFocusNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!focusZone || consumedFocusNonce.current === focusZone.nonce) return
    const node = nodes.find((candidate) => candidate.id === focusZone.zoneId)
    if (!node) return
    consumedFocusNonce.current = focusZone.nonce
    const w = node.measured?.width ?? node.width ?? 0
    const h = node.measured?.height ?? node.height ?? 0
    void setCenter(node.position.x + w / 2, node.position.y + h / 2, {
      zoom: getZoom(),
      duration: prefersReducedMotion() ? 0 : 200,
    })
  }, [focusZone, nodes, setCenter, getZoom])

  const [minimapVisible, setMinimapVisible] = useState(() =>
    persistKey ? readMinimapVisible(persistKey) : true
  )
  const toggleMinimap = () =>
    setMinimapVisible((visible) => {
      const next = !visible
      if (persistKey) writeMinimapVisible(persistKey, next)
      return next
    })

  const zoneCount = Object.keys(instance.geometry.zones).length
  const isEmpty = zoneCount === 0

  // Minimap zone classes (§D8): reveal → unmapped (dashed), then party gold on the
  // party's zones (explore, where occupancy is the party), else lit when occupied.
  const minimapClasses: Record<string, MinimapZoneClass> = {}
  for (const node of nodes) {
    const data = node.data
    // Stub ghosts (UNN-590) carry no zone data and stay off the minimap.
    if (!("revealed" in data)) continue
    if (!data.revealed) {
      minimapClasses[node.id] = "unmapped"
    } else if ("tokens" in data) {
      minimapClasses[node.id] = data.tokens.length > 0 ? "party" : "plain"
    } else {
      minimapClasses[node.id] = data.rows.length > 0 ? "occupied" : "plain"
    }
  }

  return (
    <div className="relative size-full" data-tier={tier} {...edgeFocusPairing}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeMouseEnter={(_, edge) =>
          setHovered({
            connectionId: edge.id,
            zoneIds: [edge.source, edge.target],
          })
        }
        onEdgeMouseLeave={() => setHovered(null)}
        onPaneClick={onPaneClick}
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
        minZoom={0.2}
        maxZoom={1.6}
        // Wheel zooms across tiers (§D1); the console pans on left-drag.
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
            This dungeon has no map yet — author it on My Maps, then recreate
            the delve.
          </CanvasEmptyNotice>
        )}

        {!isEmpty && (
          <CanvasCartouche
            title={dungeonName}
            subtitle={`Turn ${turnCounter}`}
          />
        )}

        {/* The overview minimap + its toggle (§D8) — the reveal now rides the card
            border vocabulary, so the old three-state legend is gone. */}
        <Panel position="bottom-left" className="m-3">
          <Button
            size="icon"
            variant="ghost"
            aria-label={minimapVisible ? "Hide minimap" : "Show minimap"}
            aria-pressed={minimapVisible}
            title={minimapVisible ? "Hide minimap" : "Show minimap"}
            className="border bg-popover shadow-sm"
            onClick={toggleMinimap}
          >
            <MapTrifoldIcon />
          </Button>
        </Panel>
        {minimapVisible && (
          <CanvasMinimap
            classByZoneId={minimapClasses}
            className="!bottom-16 !left-3 !m-0 overflow-hidden rounded-xl border shadow-lg"
          />
        )}

        {overlay}
        {bar ?? <TurnLoopBar />}
      </ReactFlow>
    </div>
  )
}
