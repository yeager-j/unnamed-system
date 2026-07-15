import { useStore } from "@xyflow/react"

import { tierOfZoom, type ZoneTier } from "./tier"

/**
 * The current camera {@link ZoneTier}, derived from React Flow's viewport zoom
 * (Dungeon Visual Overhaul §D1). Tier is never stored — the canvas stamps this on
 * its wrapper `div` as `data-tier`, and every zone node styles itself with
 * `data-tier`-scoped CSS, so a tier flip is pure CSS (no per-node React state).
 * Must be called inside a `ReactFlowProvider`.
 */
export function useCanvasTier(): ZoneTier {
  return useStore((state) => tierOfZoom(state.transform[2] * 100))
}
