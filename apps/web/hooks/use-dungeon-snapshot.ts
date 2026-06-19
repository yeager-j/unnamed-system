"use client"

import { useEffect, useRef, useState } from "react"

import { type DungeonSnapshot } from "@workspace/game/engine"

/** How often the fog view polls for the DM's live changes — the ~1.5s freshness
 *  target of UNN-466. Realtime invalidation pings (which would let this idle
 *  between changes) are UNN-468; until then polling is the sole transport. */
const POLL_INTERVAL_MS = 1500

/**
 * Fetches one snapshot. The injectable seam: the default hits the public snapshot
 * API, a test passes a fake. Rejects on a non-2xx so the hook's catch treats a 5xx
 * like a network error.
 */
export type DungeonSnapshotFetcher = (
  shortId: string
) => Promise<DungeonSnapshot>

async function fetchSnapshot(shortId: string): Promise<DungeonSnapshot> {
  const response = await fetch(`/api/dungeon/${shortId}/snapshot`, {
    cache: "no-store",
  })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  return (await response.json()) as DungeonSnapshot
}

export interface DungeonSnapshotState {
  snapshot: DungeonSnapshot
  /** A fetch failed and the snapshot may be stale; the last good value is still
   *  shown and the hook keeps trying. Never a hard error state. */
  stale: boolean
}

/**
 * Subscribes the fog player view to the DM's live changes by **polling** the
 * public snapshot route (UNN-466). The realtime-first transport the encounter
 * watch uses ({@link import("./use-encounter-snapshot").useEncounterSnapshot}) is
 * deferred to UNN-468 (the `dungeon` Ably channel + version-kind ping); this hook
 * is the polling baseline that transport degrades to, kept deliberately simple
 * until then.
 *
 * Seeds from the server-rendered `initialSnapshot` (no first-paint flash), then
 * polls every ~1.5s, comparing the dungeon row's `version` to skip redundant work.
 * Resilience: a failed poll keeps the last good snapshot and flags `stale`,
 * retrying on the next tick — it never blanks or crashes the view. The poll
 * suspends while the tab is hidden (a backgrounded watch tab would otherwise hammer
 * the route), refetching immediately on return to the foreground. Everything stops
 * once `status` is `"done"`, so a concluded delve generates no further traffic.
 */
export function useDungeonSnapshot(
  shortId: string,
  initialSnapshot: DungeonSnapshot,
  fetcher: DungeonSnapshotFetcher = fetchSnapshot
): DungeonSnapshotState {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [stale, setStale] = useState(false)

  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    if (snapshot.status === "done") return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    function poll() {
      fetcherRef
        .current(shortId)
        .then((next) => {
          if (cancelled) return
          setSnapshot(next)
          setStale(false)
        })
        .catch(() => {
          if (cancelled) return
          setStale(true)
        })
    }

    function startInterval() {
      intervalId ??= setInterval(poll, POLL_INTERVAL_MS)
    }

    function stopInterval() {
      clearInterval(intervalId)
      intervalId = undefined
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopInterval()
        return
      }
      poll()
      startInterval()
    }

    if (document.visibilityState !== "hidden") startInterval()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [shortId, snapshot.status])

  return { snapshot, stale }
}
