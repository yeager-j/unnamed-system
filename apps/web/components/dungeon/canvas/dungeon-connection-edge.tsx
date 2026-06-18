"use client"

import {
  BaseEdge,
  EdgeLabelRenderer,
  type Edge,
  type EdgeProps,
} from "@xyflow/react"

import type { ConnectionFogState } from "@workspace/game/engine"

import { EdgeFlagBadge } from "@/components/shared/canvas/edge-flag-badge"
import { useFloatingEdgePath } from "@/components/shared/canvas/use-floating-edge-path"

export type DungeonConnectionEdgeData = {
  fog: ConnectionFogState
  locked: boolean
}
export type DungeonConnectionEdge = Edge<
  DungeonConnectionEdgeData,
  "dungeonConnection"
>

/**
 * A connection on the run console (UNN-464) — the play counterpart of the
 * template `ConnectionEdge`, sharing its **floating** routing
 * ({@link useFloatingEdgePath}) so edges leave each Zone on the facing border
 * instead of looping out of a fixed handle. Read-only here (the DM doesn't draw
 * connections in Play mode), so it carries no edit toolbar — it just encodes,
 * **without color**, what players currently see: a connection players can't see
 * (`stripped` fog) is dashed + faded with an eye-off glyph; a locked one thickens
 * and shows a lock glyph. Reveal/unlock is driven from the Zone details sheet.
 */
export function DungeonConnectionEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<DungeonConnectionEdge>) {
  const geometry = useFloatingEdgePath(source, target)
  if (!geometry) return null

  const fog = data?.fog ?? "revealed"
  const locked = data?.locked ?? false
  const playersSee = fog !== "stripped"
  const { path, labelX, labelY } = geometry

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        aria-label={`Connection${playersSee ? "" : " — hidden from players"}${locked ? " — locked" : ""}`}
        style={{
          strokeWidth: locked ? 2.5 : 1.5,
          strokeDasharray: playersSee ? undefined : "6 4",
          stroke: "var(--muted-foreground)",
          opacity: playersSee ? 1 : 0.5,
        }}
      />

      {(!playersSee || locked) && (
        <EdgeLabelRenderer>
          <EdgeFlagBadge
            labelX={labelX}
            labelY={labelY}
            hidden={!playersSee}
            locked={locked}
          />
        </EdgeLabelRenderer>
      )}
    </>
  )
}
