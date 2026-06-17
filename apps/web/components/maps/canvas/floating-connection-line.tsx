"use client"

import {
  getBezierPath,
  Position,
  type ConnectionLineComponentProps,
} from "@xyflow/react"

import { getEdgeParams } from "./floating-edge"

/**
 * The drag preview for a new connection (UNN-461) — a floating line so the preview
 * leaves the source Zone from the **same** border the committed
 * {@link import("./connection-edge").ConnectionEdge} will, instead of always from
 * the grabbed handle (the mismatch the fixed-handle default caused). Emanates from
 * the source Zone's border facing the cursor and tracks the cursor end.
 */
export function FloatingConnectionLine({
  toX,
  toY,
  fromNode,
}: ConnectionLineComponentProps) {
  if (!fromNode) return null

  const cursorNode = {
    measured: { width: 1, height: 1 },
    internals: { positionAbsolute: { x: toX, y: toY } },
  }
  const { sx, sy, sourcePos } = getEdgeParams(fromNode, cursorNode)

  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: toX,
    targetY: toY,
    targetPosition: Position.Left,
  })

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={1.5}
      />
      <circle cx={toX} cy={toY} r={3} fill="var(--muted-foreground)" />
    </g>
  )
}
