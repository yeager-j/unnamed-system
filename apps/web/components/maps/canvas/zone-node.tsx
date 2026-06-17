"use client"

import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import type { ZoneNode as ZoneNodeType } from "./geometry-to-flow"
import { useMapCanvas } from "./map-canvas-context"

/**
 * A Zone rendered as a React Flow node (UNN-461) — a small card showing the Zone's
 * name, with a floating {@link NodeToolbar} (Edit details / Delete) and **four
 * connection handles** (one per side, FigJam-style) that appear while the Zone is
 * selected in edit mode; you drag from any of them to draw a connection. The
 * handles only choose the *grab point* — the resulting edge is a floating one
 * ({@link import("./connection-edge").ConnectionEdge}) that attaches to whichever
 * borders face each other — so they stay connectable (as drop targets) even while
 * invisible. All editing affordances disappear under `interactivity === "readonly"`.
 */
const HANDLE_SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const

export function ZoneNode({ data, selected }: NodeProps<ZoneNodeType>) {
  const { interactivity, openZoneDetails, deleteZone } = useMapCanvas()
  const editable = interactivity === "edit"
  const { zone } = data

  return (
    <>
      <NodeToolbar
        isVisible={editable && selected}
        position={Position.Top}
        className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openZoneDetails(zone.id)}
        >
          <PencilSimpleIcon />
          Edit details
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${zone.name}`}
          onClick={() => deleteZone(zone.id)}
        >
          <TrashIcon />
        </Button>
      </NodeToolbar>

      {editable &&
        HANDLE_SIDES.map(({ id, position }) => (
          <Handle
            key={id}
            id={id}
            type="source"
            position={position}
            className={cn(
              "!size-3 !rounded-full !border-2 !border-ring !bg-background transition-opacity",
              selected ? "!opacity-100" : "!opacity-0"
            )}
          />
        ))}

      <div
        aria-label={`Zone: ${zone.name}`}
        className={cn(
          "max-w-48 min-w-28 rounded-md border bg-card px-3 py-2 text-center shadow-sm transition-colors",
          "text-sm font-medium text-card-foreground",
          selected ? "border-ring ring-1 ring-ring" : "border-border"
        )}
      >
        <span className="line-clamp-2 break-words">{zone.name}</span>
      </div>
    </>
  )
}
