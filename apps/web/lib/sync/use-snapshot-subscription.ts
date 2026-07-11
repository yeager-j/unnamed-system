"use client"

import { useEffect, useRef, useState } from "react"

import type { RealtimeDomain } from "@/lib/realtime/channels"

import { useRealtimeChannel } from "./use-realtime-channel"
import { parseVersionPing } from "./version-ping"

/** How often a watch surface polls when realtime is unavailable — the ~1.5s
 *  freshness target (UNN-323/466), the degraded-mode fallback (ADR Decision 3). */
const POLL_INTERVAL_MS = 1500

/**
 * The shape every redacted watch snapshot shares: a composite optimistic token
 * (`version` = the temporal-layer row — encounter/dungeon; `instanceVersion` =
 * its Map Instance row) plus a lifecycle `status`. Both versions are monotonic
 * server-side and bumped independently, so a subscriber tracks **both** and
 * refetches when either advances (ADR — *Transport*).
 */
export interface VersionedSnapshot {
  version: number
  instanceVersion: number
  status: string
  /**
   * An opaque composite version folding every dimension of the snapshot —
   * including ones the two numeric tokens can't see (the encounter watch's
   * durable `vitalsVersion`s, UNN-530/535). When present, an applied response
   * whose composite equals the last applied one skips the re-render (a no-op
   * poll), and an unequal composite applies even when both numeric tokens held
   * still.
   */
  compositeVersion?: string
}

/** Fetches one snapshot. Takes an `AbortSignal` so a superseded refetch is
 *  cancelled rather than left to land out of order. */
export type SnapshotFetcher<T> = (
  shortId: string,
  signal?: AbortSignal
) => Promise<T>

export interface SnapshotSubscriptionState<T> {
  snapshot: T
  /** A fetch failed and the snapshot may be stale; the last good value is still
   *  shown and the hook keeps trying. Never a hard error state. */
  stale: boolean
  /** Force a guarded refetch — exposed so a surface that subscribes to a *second*
   *  channel (the dungeon fog view dual-subscribing to its live encounter during
   *  combat, UNN-467) can drive this snapshot's refresh through the same
   *  apply-side composite-version guard. */
  refetch: () => void
}

/** The temporal-layer version-kind for a channel — the fallback an untagged
 *  legacy ping resolves to, and the kind a temporal ping routes against. */
function temporalKind(domain: RealtimeDomain): "encounter" | "dungeon" {
  return domain === "dungeon" ? "dungeon" : "encounter"
}

/**
 * The shared realtime-or-poll subscription behind the encounter watch and the
 * dungeon fog view (UNN-468). Seeds from the server-rendered `initialSnapshot`,
 * then keeps it fresh under a **composite-version guard** that closes the
 * frontend-audit P0 apply-side race:
 *
 * - **Two monotonic refs** track the temporal + Instance versions. A realtime
 *   ping is routed by its `kind` — a `mapInstance` ping compares against the
 *   Instance ref, a temporal ping against the temporal ref — so the two version
 *   streams sharing one channel never cross-wire (a combat move/Zone reveal,
 *   which bumps only the Instance, still triggers a refetch).
 * - **Apply-side guard + `AbortController`:** every refetch aborts the prior
 *   in-flight one, and a landed response is dropped if it regressed *either*
 *   version — so out-of-order responses can never roll the rendered snapshot
 *   back (the bug that, in realtime mode with no poll running, otherwise stuck
 *   the view stale indefinitely).
 * - **Degraded fallback:** with realtime unavailable (no key, token failure,
 *   blocked sockets) it runs the visibility-aware ~1.5s poll through the *same*
 *   guarded apply path. Everything stops once `isEnded(status)`.
 */
interface SnapshotSubscriptionArgs<T extends VersionedSnapshot> {
  shortId: string
  domain: RealtimeDomain
  initialSnapshot: T
  fetcher: SnapshotFetcher<T>
  isEnded: (status: T["status"]) => boolean
}

export function useSnapshotSubscription<T extends VersionedSnapshot>({
  shortId,
  domain,
  initialSnapshot,
  fetcher,
  isEnded,
}: SnapshotSubscriptionArgs<T>): SnapshotSubscriptionState<T> {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [stale, setStale] = useState(false)
  const [realtimeAvailable, setRealtimeAvailable] = useState(false)

  /** Forward-only version refs — what ping versions and landed responses compare
   *  against. Never rolled back below a value a response already advanced to. */
  const tempVersionRef = useRef(initialSnapshot.version)
  const instanceVersionRef = useRef(initialSnapshot.instanceVersion)
  const compositeRef = useRef(initialSnapshot.compositeVersion)

  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const abortRef = useRef<AbortController | null>(null)

  /** Applies a landed response under the composite monotonic guard: drop it if
   *  it regressed either version (an out-of-order/older response), skip the
   *  re-render when the composite token proves it a no-op (an idle poll), else
   *  advance the refs and render it. A composite that *changed* while both
   *  numeric tokens held still applies — that's the durable-`vitalsVersion`
   *  dimension only the fold can see. Reaching the server clears `stale`
   *  either way. */
  function applyFetched(next: T) {
    if (
      next.version < tempVersionRef.current ||
      next.instanceVersion < instanceVersionRef.current
    ) {
      setStale(false)
      return
    }
    if (
      next.compositeVersion !== undefined &&
      next.compositeVersion === compositeRef.current
    ) {
      setStale(false)
      return
    }
    tempVersionRef.current = next.version
    instanceVersionRef.current = next.instanceVersion
    compositeRef.current = next.compositeVersion
    setSnapshot(next)
    setStale(false)
  }

  function refetch() {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    fetcherRef
      .current(shortId, controller.signal)
      .then((next) => {
        if (unmountedRef.current || controller.signal.aborted) return
        applyFetched(next)
      })
      .catch(() => {
        // A superseded (aborted) refetch is expected, not a staleness signal.
        if (controller.signal.aborted || unmountedRef.current) return
        setStale(true)
      })
  }

  useRealtimeChannel({
    domain,
    shortId,
    enabled: !isEnded(snapshot.status),
    onPing: (data) => {
      const ping = parseVersionPing(data, temporalKind(domain))
      if (!ping) return
      const ref =
        ping.kind === "mapInstance" ? instanceVersionRef : tempVersionRef
      if (ping.version <= ref.current) return
      refetch()
    },
    onReconnect: refetch,
    onAvailabilityChange: setRealtimeAvailable,
  })

  useEffect(() => {
    if (isEnded(snapshot.status) || realtimeAvailable) return

    let intervalId: ReturnType<typeof setInterval> | undefined

    function startInterval() {
      intervalId ??= setInterval(refetch, POLL_INTERVAL_MS)
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
      refetch()
      startInterval()
    }

    if (document.visibilityState !== "hidden") startInterval()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      stopInterval()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
    // `refetch` reads only refs, so it is safe to omit from deps; re-running on
    // these three is what drives the suspend/resume transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortId, realtimeAvailable, snapshot.status])

  return { snapshot, stale, refetch }
}
