"use client"

import type { TokenRequest } from "ably"
import type { BaseRealtime } from "ably/modular"
import { useEffect, useRef } from "react"

import type { RealtimeDomain } from "@/lib/realtime/channels"

/**
 * The client half of the realtime invalidation layer (realtime ADR, Decisions
 * 2–4; UNN-372): subscribes to one entity's ping channel and hands each ping's
 * advisory payload to the caller. The epic's other surfaces (watch view,
 * DM console) compose this same hook.
 *
 * Auth and naming are server-owned: the hook POSTs `{domain, shortId}` to the
 * token route and uses the **server-resolved** channel name + subscribe-only
 * token it returns — the client never assembles channel names, so a preview
 * deployment can't attach to another preview's channels. Knowledge of the
 * public shortId is the entire capability, matching the snapshot API.
 *
 * Degradation is the design (Decision 3): when the token route reports
 * unavailable (no `ABLY_API_KEY`, Ably down) the hook stays inert and the
 * caller's existing fallback — polling, `BroadcastChannel`, navigation-time
 * freshness — remains the behavior. `onAvailabilityChange` reports that state
 * (and live connection drops) so a caller with an active fallback (the watch
 * view's poll, UNN-371) can toggle it; after a dropped connection
 * re-establishes, `onReconnect` fires once so the caller can refetch whatever
 * pings were missed while offline.
 *
 * The modular browser SDK (`ably/modular`) is imported **lazily inside the
 * effect** — pages only pay for Ably once a token was actually issued, keeping
 * the signed-out watch bundle small. (The server counterpart deliberately uses
 * `Ably.Rest`; see `lib/realtime/client.ts`.)
 */

interface RealtimeTokenResponse {
  channel: string
  tokenRequest: TokenRequest
}

async function fetchRealtimeToken(
  domain: RealtimeDomain,
  shortId: string
): Promise<RealtimeTokenResponse | null> {
  const response = await fetch("/api/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, shortId }),
  })
  if (!response.ok) return null
  return (await response.json()) as RealtimeTokenResponse
}

interface UseRealtimeChannelArgs {
  domain: RealtimeDomain
  shortId: string
  /**
   * Suspends the subscription while false (default true) — e.g. the watch
   * view once its encounter has ended. Flipping it detaches/reattaches.
   */
  enabled?: boolean
  /** Receives each ping's payload, untrusted — narrow before use. */
  onPing: (data: unknown) => void
  /** Fires when a dropped connection comes back, to close the offline gap. */
  onReconnect?: () => void
  /**
   * Reports whether the realtime path is currently delivering: `false` when
   * the token route says unavailable or the connection drops, `true` on
   * (re)connect. Callers with an active fallback (the watch view's poll) key
   * it off this; fire-and-forget callers ignore it.
   */
  onAvailabilityChange?: (available: boolean) => void
}

/**
 * The mountable form of {@link useRealtimeChannel} for surfaces that subscribe
 * to a *dynamic list* of channels (one per PC combatant, one per campaign
 * encounter): render one listener per item and React's mount/unmount keeps the
 * subscription set in lockstep with the list — no imperative attach/detach
 * bookkeeping.
 */
export function RealtimeChannelListener(props: UseRealtimeChannelArgs): null {
  useRealtimeChannel(props)
  return null
}

export function useRealtimeChannel({
  domain,
  shortId,
  enabled = true,
  onPing,
  onReconnect,
  onAvailabilityChange,
}: UseRealtimeChannelArgs): void {
  const onPingRef = useRef(onPing)
  const onReconnectRef = useRef(onReconnect)
  const onAvailabilityChangeRef = useRef(onAvailabilityChange)
  useEffect(() => {
    onPingRef.current = onPing
    onReconnectRef.current = onReconnect
    onAvailabilityChangeRef.current = onAvailabilityChange
  })

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let client: BaseRealtime | null = null

    void (async () => {
      const first = await fetchRealtimeToken(domain, shortId).catch(() => null)
      if (!first || cancelled) {
        if (!cancelled) onAvailabilityChangeRef.current?.(false)
        return
      }

      const {
        BaseRealtime: Realtime,
        FetchRequest,
        WebSocketTransport,
      } = await import("ably/modular")
      if (cancelled) return

      let prefetchedTokenRequest: TokenRequest | null = first.tokenRequest
      const realtime = new Realtime({
        authCallback: (_params, callback) => {
          if (prefetchedTokenRequest) {
            callback(null, prefetchedTokenRequest)
            prefetchedTokenRequest = null
            return
          }
          fetchRealtimeToken(domain, shortId)
            .then((next) =>
              next
                ? callback(null, next.tokenRequest)
                : callback("realtime unavailable", null)
            )
            .catch((error: unknown) => callback(String(error), null))
        },
        plugins: { WebSocketTransport, FetchRequest },
      })
      client = realtime

      let hasConnected = false
      realtime.connection.on("connected", () => {
        if (hasConnected) onReconnectRef.current?.()
        hasConnected = true
        onAvailabilityChangeRef.current?.(true)
      })
      for (const down of ["disconnected", "suspended", "failed"] as const) {
        realtime.connection.on(down, () => {
          onAvailabilityChangeRef.current?.(false)
        })
      }

      realtime.channels
        .get(first.channel)
        .subscribe((message) => onPingRef.current(message.data))
        .catch((error: unknown) => {
          console.warn(`Realtime subscribe failed for ${first.channel}`, error)
          onAvailabilityChangeRef.current?.(false)
        })
    })()

    return () => {
      cancelled = true
      client?.close()
    }
  }, [domain, shortId, enabled])
}
