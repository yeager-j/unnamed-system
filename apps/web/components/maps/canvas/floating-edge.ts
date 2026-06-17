import { Position } from "@xyflow/react"

/**
 * Geometry for **floating edges** (UNN-461) — connections that attach to the
 * point on each Zone's border facing the other Zone, instead of to fixed
 * source/target handles. Map connections are **undirected** and purely spatial,
 * so the visual routing is cosmetic: floating endpoints keep an edge on the
 * facing sides no matter which handle the DM grabbed or where the nodes sit,
 * avoiding the "loops around the node" artifact of fixed handles. Adapted from
 * React Flow's floating-edges example.
 */

/** The minimal node shape {@link getEdgeParams} reads — satisfied by React Flow's
 *  `InternalNode` and by the synthetic cursor node the connection line builds. */
export interface FloatingNode {
  measured?: { width?: number; height?: number }
  internals: { positionAbsolute: { x: number; y: number } }
}

function center(node: FloatingNode): {
  x: number
  y: number
  w: number
  h: number
} {
  const w = (node.measured?.width ?? 0) / 2
  const h = (node.measured?.height ?? 0) / 2
  return {
    x: node.internals.positionAbsolute.x + w,
    y: node.internals.positionAbsolute.y + h,
    w,
    h,
  }
}

/** The point on `node`'s border on the line toward `other`'s center. */
function intersection(
  node: FloatingNode,
  other: FloatingNode
): { x: number; y: number } {
  const a = center(node)
  const b = center(other)

  if (a.w === 0 || a.h === 0) return { x: a.x, y: a.y }

  const xx1 = (b.x - a.x) / (2 * a.w) - (b.y - a.y) / (2 * a.h)
  const yy1 = (b.x - a.x) / (2 * a.w) + (b.y - a.y) / (2 * a.h)
  const magnitude = Math.abs(xx1) + Math.abs(yy1)
  if (magnitude === 0) return { x: a.x, y: a.y }

  const scaled = 1 / magnitude
  const dx = scaled * xx1
  const dy = scaled * yy1
  return { x: a.w * (dx + dy) + a.x, y: a.h * (-dx + dy) + a.y }
}

/** Which border (`Position`) the intersection point sits on. */
function borderPosition(
  node: FloatingNode,
  point: { x: number; y: number }
): Position {
  const x = node.internals.positionAbsolute.x
  const y = node.internals.positionAbsolute.y
  const width = node.measured?.width ?? 0

  if (Math.round(point.x) <= Math.round(x) + 1) return Position.Left
  if (Math.round(point.x) >= Math.round(x + width) - 1) return Position.Right
  if (Math.round(point.y) <= Math.round(y) + 1) return Position.Top
  return Position.Bottom
}

/** Source/target border points + positions for a floating edge between two nodes. */
export function getEdgeParams(
  source: FloatingNode,
  target: FloatingNode
): {
  sx: number
  sy: number
  tx: number
  ty: number
  sourcePos: Position
  targetPos: Position
} {
  const sourcePoint = intersection(source, target)
  const targetPoint = intersection(target, source)
  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos: borderPosition(source, sourcePoint),
    targetPos: borderPosition(target, targetPoint),
  }
}
