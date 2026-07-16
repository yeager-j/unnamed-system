"use client"

import "@xyflow/react/dist/style.css"

import {
  MapTrifoldIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type OnConnect,
  type OnMove,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useRef, useState, type MouseEvent, type ReactNode } from "react"

import {
  disconnectedZoneIds,
  duplicateZoneNames,
  reduceMapGeometry,
  type ConnectionFlag,
  type MapGeometry,
  type MapGeometryEvent,
  type MapZone,
} from "@workspace/game-v2/spatial"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

import {
  CANVAS_DOT_SIZE,
  CANVAS_GRID_SIZE,
} from "@/components/shared/canvas/grid"
import { footprintOf, overlappingZonePairs } from "@/domain/map/view/footprints"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

import { CanvasToolbar } from "./canvas-toolbar"
import { ConnectionEdge } from "./connection-edge"
import { FloatingConnectionLine } from "./floating-connection-line"
import {
  connectionAriaLabel,
  geometryToFlow,
  type ConnectionEdge as FlowConnectionEdge,
  type ZoneNode as FlowZoneNode,
} from "./geometry-to-flow"
import {
  HoveredConnectionProvider,
  useEdgeFocusPairing,
  useHoveredConnection,
} from "./hovered-connection-context"
import { MapCanvasProvider, type ZoneIdentityPatch } from "./map-canvas-context"
import type { ToolMode } from "./tool-mode"
import { useCanvasTier } from "./use-canvas-tier"
import { useCoarsePointer } from "./use-coarse-pointer"
import { ZoneDetailsSheet } from "./zone-details-sheet"
import { ZoneNode } from "./zone-node"

const nodeTypes = { zone: ZoneNode }
const edgeTypes = { connection: ConnectionEdge }

/**
 * The React Flow node's fixed footprint box from a Zone's authored `size` (§D2) —
 * applied on every node mutation (add / duplicate / size change), not just the
 * initial {@link geometryToFlow}, so a new or resized zone never collapses (the
 * `size-full` card fills this box) or lags until a remount.
 */
function footprintFields(zone: MapZone) {
  const { w, h } = footprintOf(zone.size)
  return { width: w, height: h, style: { width: w, height: h } }
}

/**
 * The shared node-graph canvas (UNN-461) — React Flow behind a route-agnostic,
 * presentational contract: it takes a {@link MapGeometry}, emits the edited
 * geometry through `onGeometryChange`, and knows nothing about persistence or which
 * surface hosts it (the Map editor today; the run console / player view in M2/M3
 * reuse it, gating with `interactivity`). `geometry` seeds the canvas; the canvas
 * then owns the live editing state, so the host passes its persisted geometry once.
 *
 * Two ways to consume an edit — a host wires **one**:
 * - `onGeometryChange` — the whole next blob (the Map-template editor's autosave).
 * - `onGeometryEvent` — the discrete {@link MapGeometryEvent} (the live Map Instance,
 *   which wraps it as `editGeometry` and version-guards it). Fires only when the edit
 *   actually changed the geometry (no-ops don't dispatch). UNN-486.
 *
 * The live-Instance host also passes `lockedZoneIds` (Zones an occupancy token
 * stands in — their delete affordance is disabled) and `zoneOccupants` (the party
 * standing in each Zone, so the tiered card reads occupancy at every zoom while the
 * DM edits). The template passes neither.
 *
 * `defaultViewport` + `onMoveEnd` let a host persist zoom/pan across mounts — the
 * dungeon console shares one store with its Play board so toggling Edit ⇄ Play
 * keeps the board steady (UNN-486). When `defaultViewport` is omitted the canvas
 * fits the view on mount (the Map-template editor). `bottomBarLeading` injects a
 * host control at the start of the tool palette (the console's mode toggle).
 */
export function MapCanvas(props: {
  geometry: MapGeometry
  onGeometryChange?: (geometry: MapGeometry) => void
  onGeometryEvent?: (event: MapGeometryEvent) => void
  interactivity?: "edit" | "readonly"
  lockedZoneIds?: ReadonlySet<string>
  zoneOccupants?: (zoneId: string) => SetPieceOccupant[]
  defaultViewport?: Viewport
  onMoveEnd?: OnMove
  bottomBarLeading?: ReactNode
}) {
  return (
    <ReactFlowProvider>
      <HoveredConnectionProvider>
        <MapCanvasInner {...props} />
      </HoveredConnectionProvider>
    </ReactFlowProvider>
  )
}

function MapCanvasInner({
  geometry: initialGeometry,
  onGeometryChange,
  onGeometryEvent,
  interactivity = "edit",
  lockedZoneIds,
  zoneOccupants,
  defaultViewport,
  onMoveEnd,
  bottomBarLeading,
}: {
  geometry: MapGeometry
  onGeometryChange?: (geometry: MapGeometry) => void
  onGeometryEvent?: (event: MapGeometryEvent) => void
  interactivity?: "edit" | "readonly"
  lockedZoneIds?: ReadonlySet<string>
  zoneOccupants?: (zoneId: string) => SetPieceOccupant[]
  defaultViewport?: Viewport
  onMoveEnd?: OnMove
  bottomBarLeading?: ReactNode
}) {
  const editable = interactivity === "edit"
  const { resolvedTheme } = useTheme()
  const { screenToFlowPosition } = useReactFlow()
  const tier = useCanvasTier()
  const coarsePointer = useCoarsePointer()
  const { setHovered } = useHoveredConnection()

  // Seed React Flow's interactive state once; the canvas owns it thereafter, with
  // `geometryRef` as the data source-of-truth the edit helpers transform.
  const [initialFlow] = useState(() => geometryToFlow(initialGeometry))
  const geometryRef = useRef(initialGeometry)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowZoneNode>(
    initialFlow.nodes
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowConnectionEdge>(
    initialFlow.edges
  )
  const edgeFocusPairing = useEdgeFocusPairing(edges)

  const [geometry, setGeometry] = useState(initialGeometry)
  const [mode, setMode] = useState<ToolMode>("select")
  const [detailsZoneId, setDetailsZoneId] = useState<string | null>(null)
  const [pendingDeleteZoneId, setPendingDeleteZoneId] = useState<string | null>(
    null
  )

  function applyGeometry(next: MapGeometry): MapGeometry {
    if (next === geometryRef.current) return next
    geometryRef.current = next
    setGeometry(next)
    onGeometryChange?.(next)
    return next
  }

  /** Reduce + persist one edit: apply it to the canvas's own geometry and emit it to
   *  the host (blob and/or discrete event), but only when it actually changed the
   *  geometry — a no-op edit dispatches nothing. Returns the resulting geometry. */
  function dispatchGeometry(event: MapGeometryEvent): MapGeometry {
    const before = geometryRef.current
    const next = applyGeometry(reduceMapGeometry(before, event))
    if (next !== before) onGeometryEvent?.(event)
    return next
  }

  function addZoneAt(position: { x: number; y: number }) {
    if (!editable) return
    const id = crypto.randomUUID()
    const next = dispatchGeometry({ kind: "addZone", id, position })
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = {
      id,
      type: "zone",
      position,
      ...footprintFields(zone),
      data: { zone },
    }
    setNodes((current) => [...current, node])
  }

  function handlePaneClick(event: MouseEvent) {
    if (mode === "addZone") {
      addZoneAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    }
  }

  function handlePaneDoubleClick(event: MouseEvent) {
    // In `addZone` mode the single clicks of a double-click already add via
    // `handlePaneClick`; double-click-to-add is the `select`-mode affordance only.
    if (!editable || mode === "addZone") return
    const target = event.target as HTMLElement
    if (!target.classList.contains("react-flow__pane")) return
    addZoneAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const handleNodeDragStop: OnNodeDrag<FlowZoneNode> = (_, node) => {
    dispatchGeometry({
      kind: "moveZone",
      zoneId: node.id,
      position: node.position,
    })
  }

  const handleConnect: OnConnect = (connection) => {
    if (!editable || !connection.source || !connection.target) return
    const id = crypto.randomUUID()
    const before = geometryRef.current
    const next = dispatchGeometry({
      kind: "addConnection",
      id,
      fromZoneId: connection.source,
      toZoneId: connection.target,
    })
    const created = next.connections[id]
    if (next === before || !created) return
    const fromName = next.zones[connection.source]?.name ?? ""
    const toName = next.zones[connection.target]?.name ?? ""
    const edge: FlowConnectionEdge = {
      id,
      type: "connection",
      source: connection.source,
      target: connection.target,
      ariaLabel: connectionAriaLabel(fromName, toName, created),
      data: { connection: created, fromName, toName },
    }
    setEdges((current) => [...current, edge])
  }

  function handleDuplicateZone(zoneId: string) {
    if (!editable) return
    const source = geometryRef.current.zones[zoneId]
    if (!source) return
    const id = crypto.randomUUID()
    const position = {
      x: source.position.x + 32,
      y: source.position.y + 32,
    }
    const next = dispatchGeometry({
      kind: "duplicateZone",
      sourceId: zoneId,
      newId: id,
      position,
    })
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = {
      id,
      type: "zone",
      position,
      ...footprintFields(zone),
      data: { zone },
    }
    setNodes((current) => [...current, node])
  }

  function handleDeleteZone(zoneId: string) {
    dispatchGeometry({ kind: "deleteZone", zoneId })
    setNodes((current) => current.filter((node) => node.id !== zoneId))
    setEdges((current) =>
      current.filter((edge) => edge.source !== zoneId && edge.target !== zoneId)
    )
    if (detailsZoneId === zoneId) setDetailsZoneId(null)
  }

  function patchZoneNodeData(zoneId: string, next: MapGeometry) {
    const zone = next.zones[zoneId]
    if (!zone) return
    setNodes((current) =>
      current.map((node) =>
        node.id === zoneId
          ? { ...node, ...footprintFields(zone), data: { zone } }
          : node
      )
    )
  }

  function handleRenameZone(zoneId: string, name: string) {
    const next = dispatchGeometry({ kind: "renameZone", zoneId, name })
    patchZoneNodeData(zoneId, next)
    // A rename changes the name the touching thresholds label + announce.
    setEdges((current) =>
      current.map((edge) => {
        if (edge.source !== zoneId && edge.target !== zoneId) return edge
        const fromName = next.zones[edge.source]?.name ?? ""
        const toName = next.zones[edge.target]?.name ?? ""
        return {
          ...edge,
          ariaLabel: edge.data
            ? connectionAriaLabel(fromName, toName, edge.data.connection)
            : edge.ariaLabel,
          data: edge.data ? { ...edge.data, fromName, toName } : edge.data,
        }
      })
    )
  }

  function handleSetZoneText(
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) {
    patchZoneNodeData(
      zoneId,
      dispatchGeometry({ kind: "setZoneText", zoneId, patch })
    )
  }

  function handleSetZoneIdentity(zoneId: string, identity: ZoneIdentityPatch) {
    patchZoneNodeData(
      zoneId,
      dispatchGeometry({ kind: "setZoneIdentity", zoneId, identity })
    )
  }

  function handleSetConnectionFlag(
    connectionId: string,
    flag: ConnectionFlag,
    value: boolean
  ) {
    const next = dispatchGeometry({
      kind: "setConnectionFlag",
      connectionId,
      flag,
      value,
    })
    const connection = next.connections[connectionId]
    if (!connection) return
    setEdges((current) =>
      current.map((edge) =>
        edge.id === connectionId
          ? {
              ...edge,
              ariaLabel: connectionAriaLabel(
                edge.data?.fromName ?? "",
                edge.data?.toName ?? "",
                connection
              ),
              data: {
                connection,
                fromName: edge.data?.fromName ?? "",
                toName: edge.data?.toName ?? "",
              },
            }
          : edge
      )
    )
  }

  function handleDeleteConnection(connectionId: string) {
    dispatchGeometry({ kind: "deleteConnection", connectionId })
    setEdges((current) => current.filter((edge) => edge.id !== connectionId))
  }

  const detailsZone = detailsZoneId
    ? (geometry.zones[detailsZoneId] ?? null)
    : null
  const isEmpty = Object.keys(geometry.zones).length === 0

  return (
    <MapCanvasProvider
      value={{
        interactivity,
        openZoneDetails: setDetailsZoneId,
        setZoneIdentity: handleSetZoneIdentity,
        duplicateZone: handleDuplicateZone,
        deleteZone: setPendingDeleteZoneId,
        setConnectionFlag: handleSetConnectionFlag,
        deleteConnection: handleDeleteConnection,
        lockedZoneIds,
        zoneOccupants,
      }}
    >
      <div
        className="relative size-full"
        data-tier={tier}
        {...edgeFocusPairing}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onEdgeMouseEnter={(_, edge) =>
            setHovered({
              connectionId: edge.id,
              zoneIds: [edge.source, edge.target],
            })
          }
          onEdgeMouseLeave={() => setHovered(null)}
          onPaneClick={handlePaneClick}
          onDoubleClick={handlePaneDoubleClick}
          nodesDraggable={editable && mode !== "connect"}
          nodesConnectable={editable}
          elementsSelectable={editable}
          zoomOnDoubleClick={!editable}
          connectionMode={ConnectionMode.Loose}
          connectionLineComponent={FloatingConnectionLine}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          deleteKeyCode={null}
          snapToGrid
          snapGrid={[CANVAS_GRID_SIZE, CANVAS_GRID_SIZE]}
          defaultViewport={defaultViewport}
          fitView={defaultViewport === undefined}
          fitViewOptions={{ padding: 0.2 }}
          onMoveEnd={onMoveEnd}
          minZoom={0.2}
          maxZoom={1.6}
          zoomOnScroll
          // Tier navigation is the core gesture — the wheel zooms across tiers
          // (§D1). The editor keeps left-drag box selection and gains
          // middle-drag / Space-drag panning; on coarse (touch) pointers, where
          // box selection captures the primary touch and `panOnDrag={[1]}` has
          // no equivalent, it flips to pan-first (tap to select, one-finger pan).
          selectionOnDrag={!coarsePointer}
          panOnDrag={coarsePointer ? true : [1]}
          panActivationKeyCode="Space"
          className={cn(mode === "addZone" && "cursor-copy")}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={CANVAS_GRID_SIZE}
            size={CANVAS_DOT_SIZE}
          />
          {editable && (
            <CanvasToolbar
              mode={mode}
              onModeChange={setMode}
              leading={bottomBarLeading}
            />
          )}
          <WarningsBanner geometry={geometry} />
        </ReactFlow>

        {isEmpty && editable && <EmptyState />}

        {editable && (
          <ZoneDetailsSheet
            zone={detailsZone}
            onClose={() => setDetailsZoneId(null)}
            onRename={handleRenameZone}
            onSetText={handleSetZoneText}
            onSetIdentity={handleSetZoneIdentity}
          />
        )}

        {editable && (
          <AlertDialog
            open={pendingDeleteZoneId !== null}
            onOpenChange={(open) => {
              if (!open) setPendingDeleteZoneId(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this zone?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the zone and every connection to it. This
                  can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    if (pendingDeleteZoneId) {
                      handleDeleteZone(pendingDeleteZoneId)
                    }
                    setPendingDeleteZoneId(null)
                  }}
                >
                  Delete zone
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </MapCanvasProvider>
  )
}

function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <MapTrifoldIcon className="size-8" />
      <p className="text-sm font-medium">Add a zone to start building</p>
      <p className="max-w-xs text-xs">
        Pick <span className="font-medium">Add zone</span> from the toolbar,
        then click anywhere — or double-click the canvas.
      </p>
    </div>
  )
}

function WarningsBanner({ geometry }: { geometry: MapGeometry }) {
  const disconnected = disconnectedZoneIds(geometry).length
  const duplicates = duplicateZoneNames(geometry)
  const overlaps = overlappingZonePairs(Object.values(geometry.zones)).length
  if (disconnected === 0 && duplicates.length === 0 && overlaps === 0) {
    return null
  }

  return (
    <Panel position="top-right" className="w-full max-w-xs">
      <Alert className="max-w-md border-amber-200 bg-amber-50 text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
        <WarningCircleIcon />
        <AlertTitle>Map Warnings</AlertTitle>
        <AlertDescription className="text-current">
          <ul className="flex flex-col gap-0.5">
            {disconnected > 0 && (
              <li>
                {disconnected === 1
                  ? "1 zone has no connections"
                  : `${disconnected} zones have no connections`}
              </li>
            )}
            {duplicates.length > 0 && (
              <li>Duplicate name: {duplicates.join(", ")}</li>
            )}
            {overlaps > 0 && (
              <li>
                {overlaps === 1
                  ? "2 zones overlap"
                  : `${overlaps} zone pairs overlap`}
              </li>
            )}
          </ul>
        </AlertDescription>
      </Alert>
    </Panel>
  )
}
