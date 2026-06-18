"use client"

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react/dist/ssr"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

import type { MapZone } from "@workspace/game/foundation"
import { cn } from "@workspace/ui/lib/utils"

export type DungeonZoneData = { zone: MapZone; revealed: boolean }
export type DungeonZoneNode = Node<DungeonZoneData, "dungeonZone">

/**
 * A Zone on the run console (UNN-464) — the play counterpart of the template
 * `ZoneNode`. Shows the Zone name and, **non-by-color**, whether players can see
 * it yet (an eye/eye-slash badge + a dashed muted border when hidden). Selecting
 * it opens the Zone details sheet (description, DM notes, exits, reveal/unlock),
 * driven by the canvas host's `onNodeClick`. The hidden source/target handles
 * only need to *exist* — React Flow won't create an edge for a node with no
 * handles — while the floating-edge router decides where the connection actually
 * attaches. Party tokens are separate draggable nodes, not rendered here.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const { zone, revealed } = data

  return (
    <>
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

      <div
        aria-label={`Zone: ${zone.name}${revealed ? "" : " (hidden from players)"}`}
        className={cn(
          "relative max-w-48 min-w-28 cursor-pointer rounded-md border bg-card px-3 py-2 text-center text-sm font-medium text-card-foreground shadow-sm transition-colors",
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
