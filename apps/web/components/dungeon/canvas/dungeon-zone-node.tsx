"use client"

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react/dist/ssr"
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react"

import type { MapZone } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useDungeonCanvas } from "./dungeon-canvas-context"

export type DungeonZoneData = { zone: MapZone; revealed: boolean }
export type DungeonZoneNode = Node<DungeonZoneData, "dungeonZone">

/**
 * A Zone on the run console (UNN-464) — the play counterpart of the template
 * `ZoneNode`. Shows the Zone name and, **non-by-color**, whether players can see
 * it yet (an eye/eye-slash badge + a dashed muted border when hidden). Selecting
 * it surfaces a floating toolbar to reveal it to / hide it from players; the
 * actual write is confirm-gated by the canvas host (reveal is player-visible and
 * socially irreversible — PRD FR-5). Party tokens are separate draggable nodes,
 * not rendered here.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const { toggleZoneReveal } = useDungeonCanvas()
  const { zone, revealed } = data

  return (
    <>
      {/* Hidden anchors so the (read-only) connection edges have a center to
          attach to — players never draw connections on the run console. */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!size-0 !min-w-0 !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!size-0 !min-w-0 !border-0 !bg-transparent"
      />

      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggleZoneReveal(zone.id, !revealed)}
        >
          {revealed ? <EyeSlashIcon /> : <EyeIcon />}
          {revealed ? "Hide from players" : "Reveal to players"}
        </Button>
      </NodeToolbar>

      <div
        aria-label={`Zone: ${zone.name}${revealed ? "" : " (hidden from players)"}`}
        className={cn(
          "relative max-w-48 min-w-28 rounded-md border bg-card px-3 py-2 text-center text-sm font-medium text-card-foreground shadow-sm transition-colors",
          selected ? "border-ring ring-1 ring-ring" : "border-border",
          !revealed && "border-dashed text-muted-foreground"
        )}
      >
        <span className="line-clamp-2 break-words">{zone.name}</span>
        <span
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border bg-background"
          title={revealed ? "Visible to players" : "Hidden from players"}
        >
          {revealed ? (
            <EyeIcon className="size-2.5 text-foreground" />
          ) : (
            <EyeSlashIcon className="size-2.5 text-muted-foreground" />
          )}
        </span>
      </div>
    </>
  )
}
