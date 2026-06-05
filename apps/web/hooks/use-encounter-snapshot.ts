"use client"

import { useEffect, useState } from "react"

import type { EncounterSnapshot } from "@/lib/game/encounter"

/** How often the watch view polls for the DM's latest changes — the ~1.5s
 *  freshness target of UNN-323. */
const POLL_INTERVAL_MS = 1500

/**
 * Fetches one snapshot. The injectable seam (UNN-323): the default hits the
 * public snapshot API, a test passes a fake. Rejects on a non-2xx so the hook's
 * catch treats a 5xx like a network error.
 */
export type SnapshotFetcher = (shortId: string) => Promise<EncounterSnapshot>

async function fetchSnapshot(shortId: string): Promise<EncounterSnapshot> {
  const response = await fetch(`/api/encounter/${shortId}/snapshot`, {
    cache: "no-store",
  })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  return (await response.json()) as EncounterSnapshot
}

export interface EncounterSnapshotState {
  snapshot: EncounterSnapshot
  /** A poll failed and the snapshot may be stale; the last good value is still
   *  shown and polling keeps retrying. Never a hard error state (UNN-323). */
  stale: boolean
}

/**
 * Subscribes the player watch view to the DM's live changes (UNN-323): seeds
 * from the server-rendered `initialSnapshot` (no first-paint flash), then polls
 * `/api/encounter/{shortId}/snapshot` every ~1.5s, swapping in each fresh
 * snapshot. The transport is fully encapsulated — the view imports this hook and
 * never learns it is polling, so swapping to SSE/WebSocket later touches only
 * this file.
 *
 * Resilience: a failed poll keeps the last good snapshot and flags `stale`,
 * retrying on the next tick — it never blanks or crashes the view. Polling stops
 * once `status` is `"ended"` (the effect re-runs on the status change and skips
 * scheduling a new interval), so a concluded encounter generates no further
 * traffic; the cleanup also clears the interval on unmount.
 */
export function useEncounterSnapshot(
  shortId: string,
  initialSnapshot: EncounterSnapshot,
  fetcher: SnapshotFetcher = fetchSnapshot
): EncounterSnapshotState {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (snapshot.status === "ended") return

    let cancelled = false
    const intervalId = setInterval(() => {
      fetcher(shortId)
        .then((next) => {
          if (cancelled) return
          setSnapshot(next)
          setStale(false)
        })
        .catch(() => {
          if (cancelled) return
          setStale(true)
        })
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [shortId, fetcher, snapshot.status])

  return { snapshot, stale }
}
