"use client"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import type { EncounterSnapshotResult } from "@/lib/db/queries/load-encounter-snapshot"
import { fetchJsonSnapshot } from "@/lib/sync/fetch-json-snapshot"
import {
  useSnapshotSubscription,
  type SnapshotFetcher,
  type SnapshotSubscriptionState,
} from "@/lib/sync/use-snapshot-subscription"

/**
 * The watch's subscription state: the redacted v2 spatial snapshot flattened
 * with its composite version — the fold over encounter × Instance × every
 * durable `vitalsVersion` (UNN-530) the apply guard equality-compares, so an
 * idle poll doesn't re-render and a durable HP bump (invisible to the two
 * numeric tokens) does.
 */
export type WatchSnapshot = SpatialEncounterSnapshot & {
  compositeVersion: string
}

async function fetchSnapshot(
  shortId: string,
  signal?: AbortSignal
): Promise<WatchSnapshot> {
  const result = await fetchJsonSnapshot<EncounterSnapshotResult>(
    `/api/encounter/${shortId}/snapshot`,
    signal
  )
  return { ...result.snapshot, compositeVersion: result.compositeVersion }
}

export type EncounterSnapshotState = SnapshotSubscriptionState<WatchSnapshot>

/**
 * Subscribes the **player watch view** (`/campaigns/{c}/encounter/{e}/watch`) to the DM's
 * live changes — realtime first, ~1.5s polling as the degraded fallback. A thin
 * binding of the shared {@link useSnapshotSubscription} to the `encounter`
 * channel: it carries the composite (encounter + Instance + durable vitals)
 * version guard + `AbortController` that fixes the out-of-order apply race, and
 * routes `mapInstance` pings — a combat move refreshes the watch over realtime
 * rather than waiting for the next poll (UNN-468). Everything stops once the
 * encounter is `"ended"`.
 */
export function useEncounterSnapshot(
  shortId: string,
  initialSnapshot: WatchSnapshot,
  fetcher: SnapshotFetcher<WatchSnapshot> = fetchSnapshot
): EncounterSnapshotState {
  return useSnapshotSubscription({
    shortId,
    domain: "encounter",
    initialSnapshot,
    fetcher,
    isEnded: (status) => status === "ended",
  })
}
