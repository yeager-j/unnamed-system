"use client"

import { useEffect, useRef, useState } from "react"

import { type EncounterSnapshot } from "@workspace/game/engine"

import { parseEncounterPing } from "./encounter-ping"
import { useRealtimeChannel } from "./use-realtime-channel"

/** How often the watch view polls when realtime is unavailable — the ~1.5s
 *  freshness target of UNN-323, now the degraded mode (ADR Decision 3). */
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
  /** A fetch failed and the snapshot may be stale; the last good value is
   *  still shown and the hook keeps trying. Never a hard error state
   *  (UNN-323). */
  stale: boolean
}

/**
 * Subscribes the player watch view to the DM's live changes — realtime first,
 * polling as the degraded mode (UNN-371, the transport swap this hook's
 * contract was built for; ADR Decisions 3 + 5). Seeds from the
 * server-rendered `initialSnapshot` (no first-paint flash), then:
 *
 * - **Realtime healthy:** idles between invalidation pings — no interval
 *   traffic. A ping whose `version` beats the current snapshot's triggers one
 *   refetch through the existing API (enemy redaction stays server-side);
 *   echoes and duplicates (`≤`) are dropped. On a reconnect after a drop it
 *   refetches once to close the gap, then idles again.
 * - **Realtime unavailable** (no key, token failure, blocked WebSockets, Ably
 *   outage, mid-session drop): silently falls back to the ~1.5s poll — the
 *   UNN-323 behavior, unchanged.
 *
 * Resilience: a failed fetch (poll or ping-triggered) keeps the last good
 * snapshot and flags `stale`, retrying on the next ping/tick — it never blanks
 * or crashes the view. Everything stops once `status` is `"ended"` (the
 * subscription suspends and no interval is scheduled), so a concluded
 * encounter generates no further traffic.
 */
export function useEncounterSnapshot(
  shortId: string,
  initialSnapshot: EncounterSnapshot,
  fetcher: SnapshotFetcher = fetchSnapshot
): EncounterSnapshotState {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [stale, setStale] = useState(false)
  const [realtimeAvailable, setRealtimeAvailable] = useState(false)

  /** The current snapshot's version token — what ping versions compare to. */
  const versionRef = useRef(initialSnapshot.version)

  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  // The same don't-set-state-after-unmount guard the polling effect carries,
  // for the ping/reconnect-triggered fetches below.
  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  function refetch() {
    fetcherRef
      .current(shortId)
      .then((next) => {
        if (unmountedRef.current) return
        versionRef.current = next.version
        setSnapshot(next)
        setStale(false)
      })
      .catch(() => {
        if (unmountedRef.current) return
        setStale(true)
      })
  }

  useRealtimeChannel({
    domain: "encounter",
    shortId,
    enabled: snapshot.status !== "ended",
    onPing: (data) => {
      const version = parseEncounterPing(data)?.version
      if (version === undefined || version <= versionRef.current) return
      refetch()
    },
    onReconnect: refetch,
    onAvailabilityChange: setRealtimeAvailable,
  })

  useEffect(() => {
    if (snapshot.status === "ended" || realtimeAvailable) return

    let cancelled = false
    const intervalId = setInterval(() => {
      fetcherRef
        .current(shortId)
        .then((next) => {
          if (cancelled) return
          versionRef.current = next.version
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
  }, [shortId, realtimeAvailable, snapshot.status])

  return { snapshot, stale }
}
