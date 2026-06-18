"use client"

import { getBezierPath, useInternalNode } from "@xyflow/react"

import { getEdgeParams } from "./floating-edge"

/**
 * The bezier path + midpoint for a **floating edge** between two nodes (UNN-464) —
 * the shared half of the Map editor's {@link import("../../maps/canvas/connection-edge").ConnectionEdge}
 * and the dungeon run console's {@link import("../../dungeon/canvas/dungeon-connection-edge").DungeonConnectionEdge}.
 * Reads each node's live internals ({@link useInternalNode}), computes the facing
 * border points ({@link getEdgeParams}), and bends a curve between them. Returns
 * `null` until both nodes are measured, so callers render nothing on the first
 * frame. Routing only — every surface styles the stroke/label itself.
 */
export function useFloatingEdgePath(
  source: string,
  target: string
): { path: string; labelX: number; labelY: number } | null {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode
  )
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  })

  return { path, labelX, labelY }
}
