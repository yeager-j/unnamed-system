"use client"

import { createNextObservedRoot } from "@workspace/headcanon/next/client"

import { watchInvalidations } from "@/lib/realtime/axis-invalidations"

/** Observe-only combat snapshot root. Its canon arrives with the RSC payload;
 * invalidation and degraded polling ask the App Router for the next complete,
 * server-redacted projection. */
export const useEncounterSnapshot = createNextObservedRoot({
  invalidations: watchInvalidations,
})
