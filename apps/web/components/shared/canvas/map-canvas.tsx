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
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import {
  disconnectedZoneIds,
  duplicateZoneNames,
  firstPageId,
  orderedPages,
  pageDeleteImpact,
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
import { groupZonesByPage } from "@/domain/map/view/page-groups"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

import { CanvasCartouche } from "./canvas-cartouche"
import { CanvasPageTabs } from "./canvas-page-tabs"
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
import { ZoneConnectCommand } from "./zone-connect-command"
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
  /** The map/dungeon name — the top-center cartouche title (§D8). Absent ⇒ no
   *  cartouche (a readonly embed). */
  cartoucheTitle?: string
  /**
   * The page to show (UNN-586) — React Flow only ever holds one page's nodes and
   * edges. Pass it to control paging from outside (the console's Pages sidebar);
   * omit it and the canvas pages itself (the Map editor's tabs), starting on the
   * first page in canonical order. Either way, page switches announce through
   * `onActivePageChange`.
   */
  activePageId?: string
  onActivePageChange?: (pageId: string) => void
  /** Mounts the floating page-tab strip (the Map editor). The console keeps this
   *  off — its Pages sidebar is the switcher (D3: the console's page switcher
   *  arrives deliberately, not by leak). */
  showPageTabs?: boolean
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
  cartoucheTitle,
  activePageId: activePageIdProp,
  onActivePageChange,
  showPageTabs,
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
  cartoucheTitle?: string
  activePageId?: string
  onActivePageChange?: (pageId: string) => void
  showPageTabs?: boolean
}) {
  const editable = interactivity === "edit"
  const { resolvedTheme } = useTheme()
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow()
  const tier = useCanvasTier()
  const coarsePointer = useCoarsePointer()
  const { setHovered } = useHoveredConnection()

  const [geometry, setGeometry] = useState(initialGeometry)

  // One page at a time (UNN-586): the host's prop wins when present (the console
  // pages from its sidebar); otherwise the canvas's own choice (the editor's
  // tabs). Either way an id that no longer exists (page deleted, possibly by a
  // remote edit) falls back to the first page in canonical order.
  const [internalPageId, setInternalPageId] = useState<string | null>(null)
  const requestedPageId = activePageIdProp ?? internalPageId
  const activePageId =
    requestedPageId !== null && geometry.pages[requestedPageId] !== undefined
      ? requestedPageId
      : firstPageId(geometry)

  // Seed React Flow's interactive state once; the canvas owns it thereafter, with
  // `geometryRef` as the data source-of-truth the edit helpers transform.
  const [initialFlow] = useState(() =>
    geometryToFlow(initialGeometry, activePageId)
  )
  const geometryRef = useRef(initialGeometry)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowZoneNode>(
    initialFlow.nodes
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowConnectionEdge>(
    initialFlow.edges
  )
  const edgeFocusPairing = useEdgeFocusPairing(edges)

  const [mode, setMode] = useState<ToolMode>("select")
  const [detailsZoneId, setDetailsZoneId] = useState<string | null>(null)
  const [pendingDeleteZoneId, setPendingDeleteZoneId] = useState<string | null>(
    null
  )
  const [pendingDeletePageId, setPendingDeletePageId] = useState<string | null>(
    null
  )
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null)
  const pendingFocusZoneIdRef = useRef<string | null>(null)

  /** Rebuild React Flow's nodes+edges from the live geometry — the reset every
   *  page switch and cross-page-affecting edit (picker connect, page CRUD) runs;
   *  hot-path zone/connection edits keep their incremental patches. */
  function reseedFlow(pageId: string = activePageId) {
    const flow = geometryToFlow(geometryRef.current, pageId)
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }

  // Render-phase reset on page change (React's "adjusting state when props
  // change" pattern): React Flow must never hold two pages' coordinate spaces,
  // so the refilter happens before anything else renders against the new page.
  const [lastPageId, setLastPageId] = useState(activePageId)
  if (activePageId !== lastPageId) {
    setLastPageId(activePageId)
    reseedFlow(activePageId)
  }

  /** Switch pages (chip click, tabs, host) and optionally center a zone there. */
  function navigateToPage(pageId: string, focusZoneId?: string) {
    pendingFocusZoneIdRef.current = focusZoneId ?? null
    setInternalPageId(pageId)
    if (pageId !== activePageId) onActivePageChange?.(pageId)
  }

  // Center the chip-focused zone once its page's nodes are in. Reading the node
  // from state (not geometry) keeps the math on what React Flow actually holds.
  useEffect(() => {
    const focusZoneId = pendingFocusZoneIdRef.current
    if (focusZoneId === null) return
    const node = nodes.find((candidate) => candidate.id === focusZoneId)
    if (!node) return
    pendingFocusZoneIdRef.current = null
    void setCenter(
      node.position.x + (node.width ?? 0) / 2,
      node.position.y + (node.height ?? 0) / 2,
      { zoom: getZoom(), duration: 400 }
    )
  }, [nodes, setCenter, getZoom])

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
    const next = dispatchGeometry({
      kind: "addZone",
      id,
      position,
      pageId: activePageId,
    })
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = {
      id,
      type: "zone",
      position,
      ...footprintFields(zone),
      data: { zone, crossPageLinks: [] },
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
      // The copy lands beside its source, so it belongs to the source's page.
      pageId: source.pageId,
    })
    const zone = next.zones[id]
    if (!zone) return
    const node: FlowZoneNode = {
      id,
      type: "zone",
      position,
      ...footprintFields(zone),
      // A duplicate copies no connections, so it starts with no chips.
      data: { zone, crossPageLinks: [] },
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
          ? {
              ...node,
              ...footprintFields(zone),
              // Preserve the chips — text/identity edits don't change links.
              data: { zone, crossPageLinks: node.data.crossPageLinks },
            }
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
    // A cross-page connection has no edge — its presence is chip data.
    reseedFlow()
  }

  function handleAddPage() {
    const id = crypto.randomUUID()
    const next = dispatchGeometry({ kind: "addPage", id })
    if (next.pages[id]) navigateToPage(id)
  }

  function handleRenamePage(pageId: string, name: string) {
    const before = geometryRef.current
    const next = dispatchGeometry({ kind: "renamePage", pageId, name })
    // Chips label their far page by name; a rename must reach them.
    if (next !== before) reseedFlow()
  }

  function handleDuplicatePage(sourcePageId: string) {
    const source = geometryRef.current
    const newPageId = crypto.randomUUID()
    // Caller-minted id maps (deterministic replay — the Instance re-reduces the
    // same event server-side, so the reducer must never mint).
    const zoneIdMap = Object.fromEntries(
      Object.values(source.zones)
        .filter((zone) => zone.pageId === sourcePageId)
        .map((zone) => [zone.id, crypto.randomUUID()])
    )
    const connectionIdMap = Object.fromEntries(
      Object.values(source.connections)
        .filter(
          (conn) =>
            source.zones[conn.fromZoneId]?.pageId === sourcePageId &&
            source.zones[conn.toZoneId]?.pageId === sourcePageId
        )
        .map((conn) => [conn.id, crypto.randomUUID()])
    )
    const next = dispatchGeometry({
      kind: "duplicatePage",
      sourcePageId,
      newPageId,
      zoneIdMap,
      connectionIdMap,
    })
    if (next.pages[newPageId]) navigateToPage(newPageId)
  }

  function handleDeletePage(pageId: string) {
    const before = geometryRef.current
    const next = dispatchGeometry({ kind: "deletePage", pageId })
    if (next === before) return
    if (pageId === activePageId) navigateToPage(firstPageId(next))
    // Chips pointing into the deleted page died with their connections.
    else reseedFlow()
  }

  function handleMoveZoneToPage(zoneId: string, pageId: string) {
    const before = geometryRef.current
    const next = dispatchGeometry({ kind: "moveZoneToPage", zoneId, pageId })
    // The zone left this page (or gained/lost cross-page links) — refilter.
    if (next !== before) reseedFlow()
  }

  function handlePickerConnect(sourceZoneId: string, targetZoneId: string) {
    const before = geometryRef.current
    const next = dispatchGeometry({
      kind: "addConnection",
      id: crypto.randomUUID(),
      fromZoneId: sourceZoneId,
      toZoneId: targetZoneId,
    })
    // Same-page pick ⇒ a new edge; cross-page pick ⇒ chips. Reseed covers both.
    if (next !== before) reseedFlow()
  }

  const detailsZone = detailsZoneId
    ? (geometry.zones[detailsZoneId] ?? null)
    : null
  const isEmpty = Object.keys(geometry.zones).length === 0
  const pages = orderedPages(geometry)

  const connectSource = connectSourceId
    ? (geometry.zones[connectSourceId] ?? null)
    : null
  // The picker offers every zone except the source and its current partners.
  const connectedToSource = new Set(
    connectSource
      ? Object.values(geometry.connections).flatMap((conn) =>
          conn.fromZoneId === connectSource.id
            ? [conn.toZoneId]
            : conn.toZoneId === connectSource.id
              ? [conn.fromZoneId]
              : []
        )
      : []
  )
  const connectGroups = connectSource
    ? groupZonesByPage(geometry).map((group) => ({
        ...group,
        zones: group.zones.filter(
          (zone) =>
            zone.id !== connectSource.id && !connectedToSource.has(zone.id)
        ),
      }))
    : []

  const pendingDeletePage = pendingDeletePageId
    ? (geometry.pages[pendingDeletePageId] ?? null)
    : null
  const deleteImpact = pendingDeletePageId
    ? pageDeleteImpact(geometry, pendingDeletePageId)
    : null

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
        activePageId,
        pages,
        navigateToPage,
        openConnectPicker: setConnectSourceId,
        moveZoneToPage: handleMoveZoneToPage,
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
          {editable && showPageTabs && (
            <CanvasPageTabs
              pages={pages}
              activePageId={activePageId}
              onSelect={navigateToPage}
              onAddPage={handleAddPage}
              onRenamePage={handleRenamePage}
              onDuplicatePage={handleDuplicatePage}
              onRequestDelete={setPendingDeletePageId}
            />
          )}
          <WarningsBanner geometry={geometry} />
          {cartoucheTitle ? (
            <CanvasCartouche
              title={cartoucheTitle}
              subtitle={`${Object.keys(geometry.zones).length} ${
                Object.keys(geometry.zones).length === 1 ? "zone" : "zones"
              }`}
            />
          ) : null}
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

        {editable && connectSource && (
          <ZoneConnectCommand
            open
            sourceZoneName={connectSource.name}
            groups={connectGroups}
            onSelect={(zoneId) => handlePickerConnect(connectSource.id, zoneId)}
            onClose={() => setConnectSourceId(null)}
          />
        )}

        {editable && (
          <AlertDialog
            open={pendingDeletePageId !== null}
            onOpenChange={(open) => {
              if (!open) setPendingDeletePageId(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete{" "}
                  {pendingDeletePage
                    ? `“${pendingDeletePage.name}”`
                    : "this page"}
                  ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteImpact
                    ? deletePageSummary(deleteImpact)
                    : "This removes the page."}{" "}
                  This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    if (pendingDeletePageId) {
                      handleDeletePage(pendingDeletePageId)
                    }
                    setPendingDeletePageId(null)
                  }}
                >
                  Delete page
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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

/** The cascade counts the delete-page confirm reads out, from `pageDeleteImpact`. */
function deletePageSummary(impact: {
  zoneCount: number
  intraConnectionCount: number
  severedCrossPageCount: number
}): string {
  const parts = [
    `${impact.zoneCount} ${impact.zoneCount === 1 ? "zone" : "zones"}`,
    `${impact.intraConnectionCount} ${
      impact.intraConnectionCount === 1 ? "connection" : "connections"
    }`,
  ]
  const severed =
    impact.severedCrossPageCount > 0
      ? ` (${impact.severedCrossPageCount} cross-page ${
          impact.severedCrossPageCount === 1 ? "link" : "links"
        } from other pages will also be removed)`
      : ""
  return `This removes the page with its ${parts.join(" and ")}${severed}.`
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
