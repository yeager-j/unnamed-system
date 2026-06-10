import "server-only"

import Ably from "ably"

/**
 * The lazy, module-level Ably REST client shared by the publish helper and the
 * token route. REST is the serverless-correct shape — stateless HTTP, no held
 * connection. Returns `null` when `ABLY_API_KEY` is unset, which is the switch
 * the whole realtime layer keys off: publish no-ops, the token route reports
 * unavailable, and clients run the polling fallback (ADR Decision 3) — so
 * local dev and the test suites need zero Ably setup.
 *
 * (The ADR mentions the v2 modular SDK; that distribution is browser-only and
 * is the right tool for the *subscribe* tickets. On Node the main package's
 * `Ably.Rest` is the supported REST client.)
 */
let restClient: Ably.Rest | null = null

export function getAblyRest(): Ably.Rest | null {
  const key = process.env.ABLY_API_KEY
  if (!key) return null
  restClient ??= new Ably.Rest({ key })
  return restClient
}
