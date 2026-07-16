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
  useReactFlow,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useCallback, useEffect, useState } from "react"

import { type DungeonSnapshot } from "@workspace/game-v2/visibility"

import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import { RosterInspector } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/roster-inspector"
import {
  DungeonWatchCombatZoneNode,
  type DungeonWatchCombatZoneNode as DungeonWatchCombatZoneNodeType,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/combat-zone-node"
import { WatchRosterToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/roster-token"
import {
  DungeonWatchZoneNode,
  type DungeonWatchZoneNode as DungeonWatchZoneNodeType,
  type WatchZoneExit,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/zone-node"
import { CanvasEmptyNotice } from "@/components/shared/canvas/canvas-empty-notice"
import { connectionAriaLabel } from "@/components/shared/canvas/geometry-to-flow"
import {
  CANVAS_DOT_SIZE,
  CANVAS_GRID_SIZE,
} from "@/components/shared/canvas/grid"
import {
  HoveredConnectionProvider,
  useHoveredConnection,
} from "@/components/shared/canvas/hovered-connection-context"
import { prefersReducedMotion } from "@/components/shared/canvas/reduced-motion"
import { useCanvasTier } from "@/components/shared/canvas/use-canvas-tier"
import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import { zoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import {
  watchCombatZoneView,
  watchExploreZoneView,
} from "@/domain/dungeon/view/set-piece-view"
import { footprintOf } from "@/domain/map/view/footprints"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

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

/** Known-exit stubs keyed by their revealed endpoint, carrying the loader-computed
 *  rim placement so the lone notch lands where the revealed near-notch will (§D4). */
function exitsByZone(
  snapshot: DungeonSnapshot
): Record<string, WatchZoneExit[]> {
  const byZone: Record<string, WatchZoneExit[]> = {}
  for (const exit of snapshot.exits) {
    ;(byZone[exit.zoneId] ??= []).push({
      id: exit.id,
      locked: exit.locked,
      side: exit.side,
      offset: exit.offset,
    })
  }
  return byZone
}

function buildExploreNodes(
  snapshot: DungeonSnapshot,
  ownedCharacterIds: string[],
  onInspect: (zoneId: string) => void
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
        onOpenRoster: () => onInspect(zone.id),
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
  ownedCharacterIds: string[],
  onInspect: (zoneId: string) => void
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
        onOpenRoster: () => onInspect(zone.id),
      },
    }
  })
}

/** Revealed connections (both endpoints discovered) as read-only threshold edges,
 *  reusing the run console's edge — every player-visible edge is `revealed` fog. */
function buildEdges(snapshot: DungeonSnapshot): DungeonConnectionEdgeType[] {
  const nameOf = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]))
  return snapshot.connections.map((connection) => {
    const fromName = nameOf.get(connection.fromZoneId) ?? ""
    const toName = nameOf.get(connection.toZoneId) ?? ""
    return {
      id: connection.id,
      type: "dungeonConnection" as const,
      source: connection.fromZoneId,
      target: connection.toZoneId,
      selectable: false,
      focusable: true,
      // Player-side connections are always revealed (no secrets reach the watch).
      ariaLabel: connectionAriaLabel(fromName, toName, {
        hidden: false,
        locked: connection.locked,
      }),
      data: {
        fog: "revealed" as const,
        locked: connection.locked,
        fromName,
        toName,
      },
    }
  })
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
      <HoveredConnectionProvider>
        <DungeonWatchCanvasInner {...props} />
      </HoveredConnectionProvider>
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
  const { setCenter, getZoom } = useReactFlow()
  const { setHovered } = useHoveredConnection()
  const [nodes, setNodes, onNodesChange] = useNodesState<WatchCanvasNode>([])
  const [edges, setEdges, onEdgesChange] =
    useEdgesState<DungeonConnectionEdgeType>([])

  // The roster inspector's target — owned here (the watch has no details sheet to
  // coordinate with), independent of the camera. `elementsSelectable={false}`
  // keeps the click ring-less, but `onNodeClick` still fires for center + inspect.
  const [inspectId, setInspectId] = useState<string | null>(null)
  const inspectedView =
    (inspectId !== null &&
      nodes.find((node) => node.id === inspectId)?.data.view) ||
    null

  // The inspector renders the same watch token as the in-card roster, so a
  // crowded zone keeps its HP/SP + condition popovers (§D7). In combat, resolve
  // each occupant to its redacted combatant for the ailments/battle-conditions.
  const combatantsById =
    mode.kind === "combat"
      ? new Map(
          mode.combatants.map((combatant) => [
            combatant.id as string,
            combatant,
          ])
        )
      : null
  const renderInspectorToken = (occupant: SetPieceOccupant) => (
    <WatchRosterToken
      occupant={occupant}
      combatant={combatantsById?.get(occupant.key)}
    />
  )

  const onNodeClick = useCallback(
    (_: unknown, node: WatchCanvasNode) => {
      const w = node.measured?.width ?? node.width ?? 0
      const h = node.measured?.height ?? node.height ?? 0
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: getZoom(),
        duration: prefersReducedMotion() ? 0 : 200,
      })
      const occupied = node.data.view.occupants.length > 0
      setInspectId(occupied ? node.id : null)
    },
    [setCenter, getZoom]
  )

  // Re-derive the board from each poll's snapshot. A reveal snaps the new Zone in;
  // the viewport stays put (fitView is init-only).
  useEffect(() => {
    setNodes(
      mode.kind === "combat"
        ? buildCombatNodes(
            snapshot,
            mode.combatants,
            ownedCharacterIds,
            setInspectId
          )
        : buildExploreNodes(snapshot, ownedCharacterIds, setInspectId)
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
        onNodeClick={onNodeClick}
        onEdgeMouseEnter={(_, edge) =>
          setHovered({
            connectionId: edge.id,
            zoneIds: [edge.source, edge.target],
          })
        }
        onEdgeMouseLeave={() => setHovered(null)}
        onPaneClick={() => setInspectId(null)}
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
        <RosterInspector
          view={inspectedView}
          onClose={() => setInspectId(null)}
          renderToken={renderInspectorToken}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
