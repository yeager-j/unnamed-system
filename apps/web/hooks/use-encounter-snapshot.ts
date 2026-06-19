"use client"

import { type EncounterSnapshot } from "@workspace/game/engine"

import {
  useSnapshotSubscription,
  type SnapshotFetcher,
  type SnapshotSubscriptionState,
} from "./use-snapshot-subscription"

export type { SnapshotFetcher } from "./use-snapshot-subscription"

async function fetchSnapshot(
  shortId: string,
  signal?: AbortSignal
): Promise<EncounterSnapshot> {
  const response = await fetch(`/api/encounter/${shortId}/snapshot`, {
    cache: "no-store",
    signal,
  })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  return (await response.json()) as EncounterSnapshot
}

export type EncounterSnapshotState =
  SnapshotSubscriptionState<EncounterSnapshot>

/**
 * Subscribes the **player watch view** (`/c/encounter/{shortId}`) to the DM's
 * live changes — realtime first, ~1.5s polling as the degraded fallback. A thin
 * binding of the shared {@link useSnapshotSubscription} to the `encounter`
 * channel: it carries the composite (encounter + Instance) version guard +
 * `AbortController` that fixes the out-of-order apply race, and routes
 * `mapInstance` pings — a combat move now refreshes the watch over realtime
 * rather than waiting for the next poll (UNN-468). Everything stops once the
 * encounter is `"ended"`.
 */
export function useEncounterSnapshot(
  shortId: string,
  initialSnapshot: EncounterSnapshot,
  fetcher: SnapshotFetcher<EncounterSnapshot> = fetchSnapshot
): EncounterSnapshotState {
  return useSnapshotSubscription({
    shortId,
    domain: "encounter",
    initialSnapshot,
    fetcher,
    isEnded: (status) => status === "ended",
  })
}
