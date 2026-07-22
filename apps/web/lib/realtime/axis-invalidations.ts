import type { TokenRequest } from "ably"

import {
  createLazyInvalidationAdapter,
  type InvalidationAdapter,
} from "@workspace/headcanon"
import type { AblyRealtimeClient } from "@workspace/headcanon/ably/client"
import { withPollingFallback } from "@workspace/headcanon/react"

/**
 * The client half of Headcanon axis invalidation (P2d — UNN-676): a lazy
 * {@link InvalidationAdapter} the entity predicted root subscribes through.
 *
 * Pages pay for the browser SDK only once a subscription actually exists, and
 * the token route's 503 (no
 * `ABLY_API_KEY`) degrades to `"unavailable"` without loading Ably at all. The
 * package's `createAblyInvalidationAdapter` owns everything hard: exact-set
 * `authorize()` before attach, per-axis dedup, gap recovery, connection
 * monitoring. This module owns only what the package cannot: the namespace
 * lookup, the browser client, and the token flow.
 *
 * Auth model (realtime ADR, Decisions 4/7 carried forward): the server signs
 * subscribe-only capabilities; the client never assembles raw channel names —
 * axis channels are SHA-256-hashed by the package, and the token route validates
 * that every requested channel sits inside this deployment's axis namespace.
 * Invalidation payloads carry only `{ eventId, axis, revision }` — no domain
 * data — so knowledge-free subscribe stays the same public-metadata bar as the
 * legacy channels it replaces.
 *
 * The realtime connection is created once per tab and kept open: the adapter is
 * module-scope (root-family creation), character surfaces remount often, and
 * closing on zero subscriptions would churn a websocket on every route change.
 */

interface AxisTokenNamespaceResponse {
  available: boolean
  namespace?: string
}

async function fetchAxisNamespace(): Promise<string | null> {
  const response = await fetch("/api/realtime/token").catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json()) as AxisTokenNamespaceResponse
  return body.available && body.namespace ? body.namespace : null
}

async function fetchAxisTokenRequest(
  capability: unknown
): Promise<TokenRequest | null> {
  const response = await fetch("/api/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capability }),
  }).catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json()) as { tokenRequest?: TokenRequest }
  return body.tokenRequest ?? null
}

/** Ably's authCallback tokenParams — capability arrives as an object or a
 *  pre-serialized JSON string depending on the SDK path that requested it. */
function normalizeCapability(capability: unknown): unknown {
  if (typeof capability !== "string") return capability
  try {
    return JSON.parse(capability)
  } catch {
    return capability
  }
}

async function createRealtimeClient(): Promise<AblyRealtimeClient> {
  const { BaseRealtime, FetchRequest, WebSocketTransport } =
    await import("ably/modular")
  const realtime = new BaseRealtime({
    authCallback: (params, callback) => {
      fetchAxisTokenRequest(normalizeCapability(params.capability))
        .then((tokenRequest) =>
          tokenRequest
            ? callback(null, tokenRequest)
            : callback("realtime unavailable", null)
        )
        .catch((error: unknown) => callback(String(error), null))
    },
    plugins: { WebSocketTransport, FetchRequest },
  })
  // The package's structural client interface is a subset of BaseRealtime
  // (authorize/channels/connection); the SDK's wider overloads don't narrow to
  // it implicitly.
  return realtime as unknown as AblyRealtimeClient
}

/**
 * A lazily-initialized adapter over the package's Ably subscription machinery.
 * Subscriptions arriving before initialization are buffered and flushed into the
 * real adapter once it exists; when the token route reports unavailable, every
 * subscription (present and future) is told `"unavailable"`. Predicted roots
 * preserve push-only behavior; public observe-only roots wrap this adapter in
 * the package polling fallback below.
 */
async function initializeAblyInvalidationAdapter(): Promise<InvalidationAdapter | null> {
  const namespace = await fetchAxisNamespace()
  if (!namespace) return null

  const [{ createAblyInvalidationAdapter }, realtime] = await Promise.all([
    import("@workspace/headcanon/ably/client"),
    createRealtimeClient(),
  ])
  return createAblyInvalidationAdapter({
    realtime,
    namespace,
    onMalformedMessage: (error) =>
      console.warn("[axis-invalidations] malformed message", error),
    onLifecycleError: (error) =>
      console.warn("[axis-invalidations] lifecycle error", error),
  })
}

/** One lazy transport shared by every predicted-root family for the tab. */
export const axisInvalidations: InvalidationAdapter =
  createLazyInvalidationAdapter({
    initialize: initializeAblyInvalidationAdapter,
    onInitializationError: (error) =>
      console.warn("[axis-invalidations] initialization failed", error),
  })

export const watchInvalidations = withPollingFallback(axisInvalidations, {
  intervalMs: 1_500,
  pauseWhenHidden: true,
})
