import type { NotchAnchor } from "@/domain/map/view/threshold-geometry"

/**
 * The SVG path for a threshold edge's **transparent** interaction line (UNN-633) —
 * a straight segment between the two notch anchors. The line is never drawn (AC 1);
 * `<BaseEdge>` renders it invisibly only to keep React Flow's edge interaction/a11y
 * surface, with `interactionWidth` widening the hit region around it.
 */
export const straightPath = ([a, b]: [NotchAnchor, NotchAnchor]): string =>
  `M${a.x},${a.y} L${b.x},${b.y}`
