import type { ClientIdentity } from "@workspace/replica"
import type { PushError } from "@workspace/replica/transport"
import { err, ok, type Result } from "@workspace/result"

import type { EntityReplicaRejection } from "@/domain/entity/replica/rejection"
import type { EntityReplicaSource } from "@/domain/entity/replica/transport"
import { pushEntityMutationAction } from "@/lib/actions/entity/replica/push"
import { loadEntityAcceptedAction } from "@/lib/actions/entity/replica/snapshot"
import type { EntityPushError } from "@/lib/actions/entity/replica/wire.schema"

/** Base delay after a retryable push failure; doubles per consecutive
 *  failure of the same mutation, capped below the Ably ping cadence. */
const PUSH_BACKOFF_BASE_MS = 250
const PUSH_BACKOFF_MAX_MS = 4_000

export interface EntityReplicaSourceOptions {
  readonly entityId: string
  readonly identity: ClientIdentity
  /**
   * The realtime half of the seam, injected by the hook layer: the Ably
   * character channel keyed by the entity's `shortId` (`onPing` per
   * invalidation ping, `onReconnect` after the realtime connection
   * re-establishes). Injected rather than imported so this module stays a
   * plain composition of the two Server Actions — the Ably client's React
   * lifecycle stays with the hook that owns it.
   */
  readonly subscribe: EntityReplicaSource["subscribe"]
}

/**
 * The production `EntityReplicaSource` (UNN-645): the two replica-door
 * Server Actions behind the transport seam.
 *
 * `pushEnvelope` owns two obligations the seam doc pins on it:
 *
 * - **Navigation-throw classification** (the guard-write lesson, 2026-07-11):
 *   the delivery loop is a detached chain, so `unstable_rethrow` is inert
 *   and a generic catch would turn Next's `redirect`/`forbidden` sentinels
 *   into infinite retryable redelivery. They are classified here — by their
 *   `NEXT_`-prefixed digest, the stable-ish shape Next gives framework
 *   signals — as terminal `forbidden` rejections. The push door itself never
 *   throws them by design; this guards the session/middleware layer around
 *   the action call.
 * - **Push pacing** (open decision 3): the replica retries within an epoch
 *   with no delay of its own, so the backoff between attempts lives here —
 *   exponential per consecutive retryable failure of the same mutation,
 *   abandoned immediately when the attempt is aborted.
 *
 * Error mapping collapses the protocol-dead refusals — `unknown-client`,
 * `gap`, `outcome-unavailable` — into `unknown-client`: all three mean this
 * identity's stream cannot proceed and the replica must expire and be
 * rebuilt. The authority's `onEvent` log keeps the diagnostic distinction;
 * the client's recovery is the same either way. Decode refusals and a
 * malformed envelope map to the terminal `invalid-write` rejection: this
 * build produced a write the server cannot understand, and retrying the same
 * bytes cannot help.
 */
export function createEntityReplicaSource(
  options: EntityReplicaSourceOptions
): EntityReplicaSource {
  const { entityId, identity, subscribe } = options
  const failures = new Map<number, number>()

  return {
    async fetchAccepted(_signal) {
      // Server Actions are not abortable; the transport's pull-generation
      // gate discards stale results instead, so the signal is advisory here.
      const result = await loadEntityAcceptedAction({ entityId, ...identity })
      if (!result.ok) {
        throw new Error(`entity accepted read refused: ${result.error}`)
      }
      return result.value
    },

    async pushEnvelope(envelope, signal) {
      const priorFailures = failures.get(envelope.mutationId) ?? 0
      if (priorFailures > 0) {
        const paced = await backoff(priorFailures, signal)
        if (!paced) return err({ kind: "retryable", cause: "aborted" })
      }

      let result: Result<void, EntityPushError>
      try {
        result = await pushEntityMutationAction({ entityId, envelope })
      } catch (error) {
        if (isNavigationSignal(error)) {
          failures.delete(envelope.mutationId)
          return err({ kind: "rejected", error: "forbidden" })
        }
        failures.set(envelope.mutationId, priorFailures + 1)
        return err({ kind: "retryable", cause: error })
      }

      failures.delete(envelope.mutationId)
      if (result.ok) return ok(undefined)
      return err(mapPushRefusal(result.error))
    },

    subscribe,
  }
}

function mapPushRefusal(
  refusal: EntityPushError
): PushError<EntityReplicaRejection> {
  if (refusal === "invalid-input") {
    return { kind: "rejected", error: "invalid-write" }
  }
  switch (refusal.kind) {
    case "rejected":
      return { kind: "rejected", error: refusal.error }
    case "invalid":
    case "unknown-mutation":
      return { kind: "rejected", error: "invalid-write" }
    case "unknown-client":
    case "gap":
    case "outcome-unavailable":
      return { kind: "unknown-client" }
  }
}

/**
 * `NEXT_REDIRECT` / `NEXT_HTTP_ERROR_FALLBACK;403` and kin. Next has no
 * public predicate for "is this a framework navigation signal", and
 * `unstable_rethrow` only helps inside a transition; the digest prefix is
 * the seam Next itself dispatches on. If this ever stops matching, the
 * failure mode is the loud one (retry → park), not a silent wrong turn.
 */
function isNavigationSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === "string" && digest.startsWith("NEXT_")
}

/** Abortable exponential delay; resolves false when aborted mid-wait. */
function backoff(consecutive: number, signal: AbortSignal): Promise<boolean> {
  const delay = Math.min(
    PUSH_BACKOFF_BASE_MS * 2 ** (consecutive - 1),
    PUSH_BACKOFF_MAX_MS
  )
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve(true)
    }, delay)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
