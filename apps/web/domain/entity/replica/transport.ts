import {
  createPullTransport,
  type Accepted,
  type MutationEnvelope,
  type PushError,
  type ReplicaTransport,
} from "@workspace/replica/transport"
import type { Result } from "@workspace/result"

import { compareEntityVersionVectors, type EntityVersionVector } from "./cursor"
import type { EntityReplicaInvocation, EntityReplicaState } from "./mutations"
import type { EntityReplicaRejection } from "./rejection"

/**
 * The IO seam the entity replica transport is composed over. Production wires
 * these to the snapshot Server Action, the entity-write door, and the Ably
 * character channel (`onPing` per invalidation ping, `onReconnect` once after
 * a dropped realtime connection re-establishes); tests wire a controllable
 * fake. Keeping the seam as plain functions keeps this module pure — the
 * imperative shell (auth, fetch, Ably client) stays outside `domain/`.
 *
 * `pushEnvelope` contract: a throw reaching the transport is classified
 * ambiguous-retryable and REDELIVERED — and that includes Next navigation
 * sentinels (`redirect`/`forbidden`/`unauthorized`), deliberately. A throw
 * from the layers around the action means the authority recorded nothing;
 * mapping it to `rejected` would advance the replica past an unrecorded ID
 * and wedge the stream (Codex P2, PR #385, which corrected this doc's
 * original instruction to classify them as terminal). The retry budget
 * bounds the redelivery and parks the replica; re-authentication then
 * resumes the SAME id via liveness. Auth refusals proper are terminal
 * `rejected` results typed by the door, never throws. (The 2026-07-11
 * guard-write lesson still applies in its original home — transition-bound
 * catches — but a detached delivery loop with park semantics wants the
 * opposite move.)
 */
export interface EntityReplicaSource<Remote = void> {
  fetchAccepted(
    signal: AbortSignal
  ): Promise<Accepted<EntityReplicaState, EntityVersionVector>>
  pushEnvelope(
    envelope: MutationEnvelope<EntityReplicaInvocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<EntityReplicaRejection>>>
  subscribe(events: { onPing(): void; onReconnect(): void }): () => void
}

export interface EntityReplicaTransportOptions<Remote = void> {
  readonly source: EntityReplicaSource<Remote>
  /** The accepted tuple the replica was loaded with (the causal floor). */
  readonly initial: Accepted<EntityReplicaState, EntityVersionVector>
}

/**
 * Showtime's entity transport: `createPullTransport` keyed on the per-class
 * version vector, with Ably pings and reconnects both mapped to the same
 * invalidation signal — the gate, not the ping payload, decides causality,
 * so a stale or echoed ping costs one suppressed read instead of a wrong
 * emission.
 */
export function createEntityReplicaTransport<Remote = void>(
  options: EntityReplicaTransportOptions<Remote>
): ReplicaTransport<
  EntityReplicaState,
  EntityReplicaInvocation,
  EntityReplicaRejection,
  Remote,
  EntityVersionVector
> {
  const { source } = options
  return createPullTransport({
    source: {
      fetchAccepted: (signal) => source.fetchAccepted(signal),
      pushEnvelope: (envelope, signal) => source.pushEnvelope(envelope, signal),
      subscribe: (invalidate) =>
        source.subscribe({ onPing: invalidate, onReconnect: invalidate }),
    },
    initial: options.initial,
    classify: compareEntityVersionVectors,
  })
}
