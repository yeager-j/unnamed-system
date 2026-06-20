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

import {
  connectionFogState,
  isConnectionLocked,
  type Pool,
  type ZoneLayoutView,
} from "@workspace/game/engine"
import type { MapInstanceState } from "@workspace/game/foundation"

import {
  DungeonCombatZoneNode,
  type DungeonCombatZoneNode as DungeonCombatZoneNodeType,
} from "./dungeon-combat-zone-node"
import {
  DungeonConnectionEdge,
  type DungeonConnectionEdge as DungeonConnectionEdgeType,
} from "./dungeon-connection-edge"
import { type DungeonSetupZoneToken } from "./dungeon-setup-token-chip"
import {
  DungeonSetupZoneNode,
  type DungeonSetupZoneNode as DungeonSetupZoneNodeType,
} from "./dungeon-setup-zone-node"
import {
  DungeonZoneNode,
  type DungeonZoneNode as DungeonZoneNodeType,
  type DungeonZoneToken,
} from "./dungeon-zone-node"
import { TurnLoopBar } from "./turn-loop-bar"
import { readViewport, writeViewport } from "./viewport-store"

const nodeTypes = {
  dungeonZone: DungeonZoneNode,
  dungeonCombatZone: DungeonCombatZoneNode,
  dungeonSetupZone: DungeonSetupZoneNode,
}
const edgeTypes = { dungeonConnection: DungeonConnectionEdge }

export interface DungeonRosterEntry {
  name: string
  portraitUrl: string | null
  /** Current/max vitals for the token's health bars (UNN-489). Optional — the DM
   *  exploration board fills them from the hydrated party; absent ⇒ no bars. */
  hp?: Pool
  sp?: Pool
}

/**
 * Which board the canvas draws: **play** (exploration — PC tokens from the delve
 * roster) or **combat** (the encounter battlefield — combatant tokens from the
 * shaped {@link ZoneLayoutView}). Only one phase is mounted at a time, so the
 * canvas shell is shared and the run console swaps the mode + the matching context
 * provider + the matching bottom `bar`.
 */
export type DungeonCanvasMode =
  | { kind: "play"; roster: Record<string, DungeonRosterEntry> }
  | { kind: "combat"; layout: ZoneLayoutView }
  | { kind: "setup"; tokensByZone: Record<string, DungeonSetupZoneToken[]> }

type CanvasNode =
  | DungeonZoneNodeType
  | DungeonCombatZoneNodeType
  | DungeonSetupZoneNodeType

/** The party tokens standing in each Zone (play mode), keyed by Zone id. Tokens
 *  whose occupant isn't in the delve roster are dropped — during exploration the
 *  only such keys are leftover enemy-combatant tokens from a just-ended fight,
 *  pruned for real in UNN-469; rendering them as "Unknown" would mislead. */
function tokensByZone(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): Record<string, DungeonZoneToken[]> {
  const byZone: Record<string, DungeonZoneToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    const entry = roster[characterId]
    if (!entry) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: entry.name,
      portraitUrl: entry.portraitUrl,
      hp: entry.hp,
      sp: entry.sp,
    })
  }
  return byZone
}

function buildPlayNodes(
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

function buildCombatNodes(
  instance: MapInstanceState,
  layout: ZoneLayoutView
): CanvasNode[] {
  const byZone = new Map(layout.zones.map((zone) => [zone.id, zone]))
  return Object.values(instance.geometry.zones).map((zone) => {
    const entry = byZone.get(zone.id)
    return {
      id: zone.id,
      type: "dungeonCombatZone",
      position: zone.position,
      draggable: false,
      data: {
        zone,
        revealed: instance.reveal.revealedZoneIds.includes(zone.id),
        tokens: entry?.combatants ?? [],
        // Engaged is a game rule (rulebook §3.5) — derived in the engine's
        // ZoneLayoutView, not here (CLAUDE.md: no game logic in the UI layer).
        engaged: entry?.engaged ?? false,
        enchantment: entry?.enchantment,
      },
    }
  })
}

function buildSetupNodes(
  instance: MapInstanceState,
  tokensByZone: Record<string, DungeonSetupZoneToken[]>
): CanvasNode[] {
  return Object.values(instance.geometry.zones).map((zone) => ({
    id: zone.id,
    type: "dungeonSetupZone",
    position: zone.position,
    draggable: false,
    data: {
      zone,
      revealed: instance.reveal.revealedZoneIds.includes(zone.id),
      tokens: tokensByZone[zone.id] ?? [],
    },
  }))
}

function buildNodes(
  instance: MapInstanceState,
  mode: DungeonCanvasMode
): CanvasNode[] {
  switch (mode.kind) {
    case "play":
      return buildPlayNodes(instance, mode.roster)
    case "combat":
      return buildCombatNodes(instance, mode.layout)
    case "setup":
      return buildSetupNodes(instance, mode.tokensByZone)
  }
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
      // The authored secret flag — distinct from the fog state, so the DM can
      // tell a deliberately-hidden passage apart from one players just haven't
      // discovered yet (which auto-surfaces as a silhouette on reveal).
      hidden: connection.hidden,
    },
  }))
}

/**
 * The DM run console's shared map canvas (UNN-464 / UNN-467) — one controlled
 * React Flow surface for both the exploration **play** board and the **combat**
 * battlefield, branched by {@link DungeonCanvasMode}. It re-derives its nodes/edges
 * from the **optimistic** {@link MapInstanceState} (and the shaped combat layout)
 * on every change, so a move/reveal/turn re-lays the board with no extra state.
 * Zones are fixed cards; connections are read-only fog-styled floating edges. The
 * bottom `bar` (the play {@link TurnLoopBar} or the combat panels) renders **inside**
 * the flow as a Panel so it can own the zoom controls; its dispatchers come from
 * the context the run console provides above the canvas.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  mode: DungeonCanvasMode
  bar?: ReactNode
  /** Persists zoom/pan across phase remounts, keyed by the dungeon's `shortId` —
   *  see {@link import("./viewport-store").readViewport}. */
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
