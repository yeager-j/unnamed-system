"use client"

import type { TokenRequest } from "ably"
import { BaseRealtime, FetchRequest, WebSocketTransport } from "ably/modular"
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
 * freshness — remains the behavior. After a dropped connection re-establishes,
 * `onReconnect` fires once so the caller can refetch whatever pings were
 * missed while offline.
 *
 * Uses the modular browser SDK (`ably/modular`) for bundle size — the server
 * counterpart deliberately uses `Ably.Rest` instead (see
 * `lib/realtime/client.ts`).
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
  /** Receives each ping's payload, untrusted — narrow before use. */
  onPing: (data: unknown) => void
  /** Fires when a dropped connection comes back, to close the offline gap. */
  onReconnect?: () => void
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
  onPing,
  onReconnect,
}: UseRealtimeChannelArgs): void {
  const onPingRef = useRef(onPing)
  const onReconnectRef = useRef(onReconnect)
  useEffect(() => {
    onPingRef.current = onPing
    onReconnectRef.current = onReconnect
  })

  useEffect(() => {
    let cancelled = false
    let client: BaseRealtime | null = null

    void (async () => {
      const first = await fetchRealtimeToken(domain, shortId).catch(() => null)
      if (!first || cancelled) return

      let prefetchedTokenRequest: TokenRequest | null = first.tokenRequest
      client = new BaseRealtime({
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

      let hasConnected = false
      client.connection.on("connected", () => {
        if (hasConnected) onReconnectRef.current?.()
        hasConnected = true
      })

      client.channels
        .get(first.channel)
        .subscribe((message) => onPingRef.current(message.data))
        .catch((error: unknown) => {
          console.warn(`Realtime subscribe failed for ${first.channel}`, error)
        })
    })()

    return () => {
      cancelled = true
      client?.close()
    }
  }, [domain, shortId])
}
