"use client"

import { MiniMap, type Node } from "@xyflow/react"

/**
 * How a zone reads on the minimap — one fact per fill/stroke (Dungeon Visual
 * Overhaul §D6/§D8). The **caller** classifies each zone (by id), because the kit is
 * engine-free and can't know a surface's node-data shape.
 */
export type MinimapZoneClass = "party" | "occupied" | "unmapped" | "plain"

const FILL: Record<MinimapZoneClass, string> = {
  party: "var(--gold)", // the party's own gold stake, rationed (§D6)
  occupied: "oklch(1 0 0 / 0.16)", // lit
  unmapped: "transparent", // dashed outline only
  plain: "oklch(1 0 0 / 0.07)",
}

const STROKE: Record<MinimapZoneClass, string> = {
  party: "var(--gold)",
  occupied: "transparent",
  unmapped: "oklch(1 0 0 / 0.22)",
  plain: "transparent",
}

/**
 * The overview minimap (§D8) — React Flow's `<MiniMap>` restyled to the handoff's
 * plan: a scaled plate of every zone (party gold / occupied lit / unmapped dashed)
 * under a **gold viewport frame** (`maskStrokeColor`) that tracks the camera live.
 * Pinned bottom-left; pannable/zoomable so it doubles as a jump control. On by
 * default in the DM console (toggle persisted in the viewport store), off on the
 * watch, absent in the editor.
 */
export function CanvasMinimap({
  classByZoneId,
  className,
}: {
  classByZoneId: Record<string, MinimapZoneClass>
  className?: string
}) {
  const classOf = (node: Node): MinimapZoneClass =>
    classByZoneId[node.id] ?? "plain"
  return (
    <MiniMap
      pannable
      zoomable
      position="bottom-left"
      ariaLabel="Dungeon minimap"
      className={className}
      bgColor="oklch(0.13 0.006 285)"
      maskColor="oklch(0.07 0.006 285 / 0.6)"
      maskStrokeColor="var(--gold)"
      maskStrokeWidth={2}
      nodeColor={(node) => FILL[classOf(node)]}
      nodeStrokeColor={(node) => STROKE[classOf(node)]}
      nodeStrokeWidth={2}
      nodeClassName={(node) =>
        classOf(node) === "unmapped" ? "[stroke-dasharray:3]" : ""
      }
    />
  )
}
