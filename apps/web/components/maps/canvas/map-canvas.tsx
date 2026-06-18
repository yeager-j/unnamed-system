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
  type OnNodeDrag,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useRef, useState, type MouseEvent } from "react"

import type { MapGeometry, MapZone } from "@workspace/game/foundation"
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

import { CanvasToolbar } from "./canvas-toolbar"
import { ConnectionEdge } from "./connection-edge"
import { FloatingConnectionLine } from "./floating-connection-line"
import {
  addConnection,
  addZone,
  deleteConnection,
  deleteZone,
  duplicateZone,
  moveZone,
  renameZone,
  setConnectionFlag,
  setZoneText,
  type ConnectionFlag,
} from "./geometry-edits"
import {
  geometryToFlow,
  type ConnectionEdge as FlowConnectionEdge,
  type ZoneNode as FlowZoneNode,
} from "./geometry-to-flow"
import { disconnectedZoneIds, duplicateZoneNames } from "./geometry-warnings"
import { MapCanvasProvider } from "./map-canvas-context"
import type { ToolMode } from "./tool-mode"
import { ZoneDetailsSheet } from "./zone-details-sheet"
import { ZoneNode } from "./zone-node"

const nodeTypes = { zone: ZoneNode }
const edgeTypes = { connection: ConnectionEdge }

/**
 * The shared node-graph canvas (UNN-461) — React Flow behind a route-agnostic,
 * presentational contract: it takes a {@link MapGeometry}, emits the edited
 * geometry through `onGeometryChange`, and knows nothing about persistence or which
 * surface hosts it (the Map editor today; the run console / player view in M2/M3
 * reuse it, gating with `interactivity`). `geometry` seeds the canvas; the canvas
 * then owns the live editing state, so the host passes its persisted geometry once
 * and wires `onGeometryChange` to its autosave.
 */
export function MapCanvas(props: {
  geometry: MapGeometry
  onGeometryChange: (geometry: MapGeometry) => void
  interactivity?: "edit" | "readonly"
}) {
  return (
    <ReactFlowProvider>
      <MapCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function MapCanvasInner({
  geometry: initialGeometry,
  onGeometryChange,
  interactivity = "edit",
}: {
  geometry: MapGeometry
  onGeometryChange: (geometry: MapGeometry) => void
  interactivity?: "edit" | "readonly"
}) {
  const editable = interactivity === "edit"
  const { resolvedTheme } = useTheme()
  const { screenToFlowPosition } = useReactFlow()

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
    onGeometryChange(next)
    return next
  }

  function addZoneAt(position: { x: number; y: number }) {
    if (!editable) return
    const id = crypto.randomUUID()
    const next = applyGeometry(addZone(geometryRef.current, id, position))
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = { id, type: "zone", position, data: { zone } }
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
    applyGeometry(moveZone(geometryRef.current, node.id, node.position))
  }

  const handleConnect: OnConnect = (connection) => {
    if (!editable || !connection.source || !connection.target) return
    const id = crypto.randomUUID()
    const before = geometryRef.current
    const next = applyGeometry(
      addConnection(before, id, connection.source, connection.target)
    )
    const created = next.connections[id]
    if (next === before || !created) return
    const edge: FlowConnectionEdge = {
      id,
      type: "connection",
      source: connection.source,
      target: connection.target,
      data: { connection: created },
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
    const next = applyGeometry(
      duplicateZone(geometryRef.current, zoneId, id, position)
    )
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = { id, type: "zone", position, data: { zone } }
    setNodes((current) => [...current, node])
  }

  function handleDeleteZone(zoneId: string) {
    applyGeometry(deleteZone(geometryRef.current, zoneId))
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
        node.id === zoneId ? { ...node, data: { zone } } : node
      )
    )
  }

  function handleRenameZone(zoneId: string, name: string) {
    patchZoneNodeData(
      zoneId,
      applyGeometry(renameZone(geometryRef.current, zoneId, name))
    )
  }

  function handleSetZoneText(
    zoneId: string,
    patch: Partial<Pick<MapZone, "description" | "dmNotes">>
  ) {
    patchZoneNodeData(
      zoneId,
      applyGeometry(setZoneText(geometryRef.current, zoneId, patch))
    )
  }

  function handleSetConnectionFlag(
    connectionId: string,
    flag: ConnectionFlag,
    value: boolean
  ) {
    const next = applyGeometry(
      setConnectionFlag(geometryRef.current, connectionId, flag, value)
    )
    const connection = next.connections[connectionId]
    if (!connection) return
    setEdges((current) =>
      current.map((edge) =>
        edge.id === connectionId ? { ...edge, data: { connection } } : edge
      )
    )
  }

  function handleDeleteConnection(connectionId: string) {
    applyGeometry(deleteConnection(geometryRef.current, connectionId))
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
        duplicateZone: handleDuplicateZone,
        deleteZone: setPendingDeleteZoneId,
        setConnectionFlag: handleSetConnectionFlag,
        deleteConnection: handleDeleteConnection,
      }}
    >
      <div className="relative size-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={handlePaneClick}
          onDoubleClick={handlePaneDoubleClick}
          nodesDraggable={editable && mode !== "connect" && mode !== "pan"}
          nodesConnectable={editable}
          elementsSelectable={editable && mode !== "pan"}
          zoomOnDoubleClick={!editable}
          connectionMode={ConnectionMode.Loose}
          connectionLineComponent={FloatingConnectionLine}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          panOnScroll
          selectionOnDrag
          panOnDrag={false}
          className={cn(
            mode === "addZone" && "cursor-copy",
            mode === "pan" && "cursor-grab"
          )}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          {editable && <CanvasToolbar mode={mode} onModeChange={setMode} />}
          <WarningsBanner geometry={geometry} />
        </ReactFlow>

        {isEmpty && editable && <EmptyState />}

        {editable && (
          <ZoneDetailsSheet
            zone={detailsZone}
            onClose={() => setDetailsZoneId(null)}
            onRename={handleRenameZone}
            onSetText={handleSetZoneText}
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
  if (disconnected === 0 && duplicates.length === 0) return null

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
          </ul>
        </AlertDescription>
      </Alert>
    </Panel>
  )
}
