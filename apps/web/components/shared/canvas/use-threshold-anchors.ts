"use client"

import { useInternalNode } from "@xyflow/react"

import {
  thresholdAnchors,
  type NotchAnchor,
} from "@/domain/map/view/threshold-geometry"

/**
 * The two notch anchors for a connection's rim thresholds (UNN-633, §D4) — the P2
 * successor to `useFloatingEdgePath`. Reads each node's live internals
 * ({@link useInternalNode}: absolute position + measured size) into world rects and
 * hands them to the pure {@link thresholdAnchors}. Returns the anchors in source/target
 * order (index 0 on the source zone's wall, index 1 on the target's), or `null` until
 * both nodes are measured so callers render nothing on the first frame.
 *
 * The kit imports the geometry downward from `domain/map/view` (§0); this hook is the
 * React Flow plumbing the pure function stays free of.
 */
export function useThresholdAnchors(
  source: string,
  target: string
): [NotchAnchor, NotchAnchor] | null {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const sw = sourceNode.measured?.width
  const sh = sourceNode.measured?.height
  const tw = targetNode.measured?.width
  const th = targetNode.measured?.height
  if (!sw || !sh || !tw || !th) return null

  return thresholdAnchors(
    {
      x: sourceNode.internals.positionAbsolute.x,
      y: sourceNode.internals.positionAbsolute.y,
      w: sw,
      h: sh,
    },
    {
      x: targetNode.internals.positionAbsolute.x,
      y: targetNode.internals.positionAbsolute.y,
      w: tw,
      h: th,
    }
  )
}
