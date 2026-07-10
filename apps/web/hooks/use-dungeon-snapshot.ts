"use client"

import { type DungeonSnapshot } from "@workspace/game-v2/visibility"

import {
  useSnapshotSubscription,
  type SnapshotFetcher,
  type SnapshotSubscriptionState,
} from "./use-snapshot-subscription"

async function fetchSnapshot(
  shortId: string,
  signal?: AbortSignal
): Promise<DungeonSnapshot> {
  const response = await fetch(`/api/dungeon/${shortId}/snapshot`, {
    cache: "no-store",
    signal,
  })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  return (await response.json()) as DungeonSnapshot
}

export type DungeonSnapshotState = SnapshotSubscriptionState<DungeonSnapshot>

/**
 * Subscribes the **dungeon fog view** (`/c/dungeon/{shortId}`) to the DM's live
 * changes — realtime first, ~1.5s polling as the degraded fallback. A thin
 * binding of the shared {@link useSnapshotSubscription} to the `dungeon` channel
 * (UNN-468): a Zone reveal or token move bumps only the Map Instance, so the
 * `mapInstance`-kind ping is what drives the fog view's live updates, compared
 * against the Instance version ref. Everything stops once the delve is `"done"`.
 *
 * During a delve fight the snapshot's `combat` linkage swaps the watch body, and
 * the combat body dual-subscribes to the fight's encounter channel — driving this
 * snapshot's `refetch` when the shared Instance advances, since combat writes
 * ping the encounter channel, not this one (UNN-604).
 */
export function useDungeonSnapshot(
  shortId: string,
  initialSnapshot: DungeonSnapshot,
  fetcher: SnapshotFetcher<DungeonSnapshot> = fetchSnapshot
): DungeonSnapshotState {
  return useSnapshotSubscription({
    shortId,
    domain: "dungeon",
    initialSnapshot,
    fetcher,
    isEnded: (status) => status === "done",
  })
}
