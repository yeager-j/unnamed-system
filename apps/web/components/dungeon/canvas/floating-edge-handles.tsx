"use client"

import { Handle, Position } from "@xyflow/react"

/**
 * The pair of **invisible, non-connectable** React Flow handles a dungeon Zone node
 * must render so the floating-edge router can attach connections to it. Shared by
 * the DM run console's {@link import("@/components/dungeon/canvas/explore/zone-node").DungeonZoneNode} and the
 * player fog view's {@link import("@/components/dungeon/canvas/watch/zone-node").DungeonWatchZoneNode}.
 *
 * They are deliberately zero-sized and `isConnectable={false}`: players/DMs don't
 * drag edges off them (that's the template editor's *visible* handles), but React
 * Flow **won't create an edge for a node with no handles at all** — the floating
 * router ({@link import("@/components/shared/canvas/use-floating-edge-path").useFloatingEdgePath})
 * only overrides *where* an edge attaches, not *whether* it can. So both a `source`
 * and a `target` handle have to exist even though neither is seen. Don't remove them.
 */
export function FloatingEdgeHandles() {
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
    </>
  )
}
