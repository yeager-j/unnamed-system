"use client"

import { createNextObservedRoot } from "@workspace/headcanon/next/client"

import { watchInvalidations } from "@/lib/realtime/axis-invalidations"

/** Observe-only dungeon snapshot root over the complete redacted RSC canon. */
export const useDungeonSnapshot = createNextObservedRoot({
  invalidations: watchInvalidations,
})
