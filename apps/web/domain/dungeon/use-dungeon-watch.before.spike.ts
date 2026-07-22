"use client"

import { useRouterRefresh } from "@workspace/headcanon/next/client"
import { createObservedRoot } from "@workspace/headcanon/react"

import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/**
 * UNN-688 spike: the observe-only fixture, current explicit form. No production
 * observed-root consumer exists yet (watch views still ride legacy pings), so
 * this pair stands in for the first one. Note the two package entries.
 */
export const useDungeonWatchBeforeSpike = createObservedRoot({
  refresh: useRouterRefresh,
  invalidations: axisInvalidations,
})
