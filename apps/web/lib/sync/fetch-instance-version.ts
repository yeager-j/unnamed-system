"use client"

import { getEncounterInstanceVersionAction } from "@/lib/actions/encounter/instance-version"

import { makeVersionRefetcher } from "./make-version-refetcher"

/**
 * Adapts {@link getEncounterInstanceVersionAction} into the `refetchVersion`
 * shape {@link import("./use-queued-write").useQueuedWrite} expects — the
 * Map-Instance twin of {@link import("./fetch-encounter-version").fetchEncounterVersion},
 * so both of the console's write queues get the identical one-shot stale-retry
 * wiring (UNN-535).
 */
export const fetchInstanceVersion = makeVersionRefetcher(
  getEncounterInstanceVersionAction
)
