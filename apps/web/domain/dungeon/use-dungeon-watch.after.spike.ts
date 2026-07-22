"use client"

import { createNextObservedRoot } from "@workspace/headcanon/next/client"

import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/** UNN-688 spike: the observe-only fixture, golden-path form. */
export const useDungeonWatchAfterSpike = createNextObservedRoot({
  invalidations: axisInvalidations,
})
