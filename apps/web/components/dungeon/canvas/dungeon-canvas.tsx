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
  type Edge,
  type OnNodeDrag,
} from "@xyflow/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { connectionFogState, isConnectionLocked } from "@workspace/game/engine"
import type { MapInstanceState } from "@workspace/game/foundation"
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

import { DungeonCanvasProvider } from "./dungeon-canvas-context"
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

function buildEdges(instance: MapInstanceState): Edge[] {
  return Object.values(instance.geometry.connections).map((connection) => {
    const playersSee =
      connectionFogState(connection, instance.reveal) !== "stripped"
    const locked = isConnectionLocked(connection, instance.reveal)
    return {
      id: connection.id,
      source: connection.fromZoneId,
      target: connection.toZoneId,
      selectable: false,
      style: {
        strokeWidth: locked ? 2.5 : 1.5,
        strokeDasharray: playersSee ? undefined : "6 4",
        opacity: playersSee ? 1 : 0.5,
      },
      label: locked ? "🔒 locked" : undefined,
    }
  })
}

/**
 * The DM run console's Play-mode map (UNN-464) — a dedicated controlled React Flow
 * canvas (the template `MapCanvas` stays the uncontrolled editor; in-console
 * geometry editing is UNN-486). It derives its nodes/edges from the **optimistic**
 * {@link MapInstanceState} on every change, so a move or reveal re-lays the board
 * with no extra state:
 *
 * - **Zones** are fixed (non-draggable) cards showing their reveal state.
 * - **Tokens** are draggable PC chips; dropping one onto a Zone fires
 *   `onMoveToken` (the engine guides-not-blocks — any Zone is accepted, the party
 *   can split). A drop landing on no Zone snaps back.
 * - **Reveal** is confirm-gated here (player-visible, socially irreversible — PRD
 *   FR-5); hiding is immediate. Connection reveal/unlock lives in the rail.
 */
export function DungeonCanvas(props: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onMoveToken: (characterId: string, toZoneId: string) => void
  onRevealZone: (zoneId: string) => void
  onHideZone: (zoneId: string) => void
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
  onRevealZone,
  onHideZone,
}: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onMoveToken: (characterId: string, toZoneId: string) => void
  onRevealZone: (zoneId: string) => void
  onHideZone: (zoneId: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [pendingRevealZoneId, setPendingRevealZoneId] = useState<string | null>(
    null
  )

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

  function toggleZoneReveal(zoneId: string, revealed: boolean) {
    if (revealed) {
      setPendingRevealZoneId(zoneId)
    } else {
      onHideZone(zoneId)
    }
  }

  const isEmpty = Object.keys(instance.geometry.zones).length === 0

  return (
    <DungeonCanvasProvider value={{ toggleZoneReveal }}>
      <div className="relative size-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={handleNodeDragStop}
          nodesConnectable={false}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          {isEmpty && (
            <Panel
              position="top-center"
              className="rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm"
            >
              This dungeon has no map yet — author it on My Maps, then recreate
              the delve.
            </Panel>
          )}
        </ReactFlow>

        <AlertDialog
          open={pendingRevealZoneId !== null}
          onOpenChange={(open) => {
            if (!open) setPendingRevealZoneId(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reveal this zone to players?</AlertDialogTitle>
              <AlertDialogDescription>
                Players will see this zone on their map. Revealing is visible to
                everyone and can&apos;t be quietly undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingRevealZoneId) onRevealZone(pendingRevealZoneId)
                  setPendingRevealZoneId(null)
                }}
              >
                Reveal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DungeonCanvasProvider>
  )
}
