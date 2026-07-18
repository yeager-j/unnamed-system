import {
  createCausalAcceptanceGate,
  createPullGenerationGate,
  type Accepted,
  type MutationEnvelope,
  type PushError,
  type ReplicaTransport,
} from "@workspace/replica/transport"
import { err, type Result } from "@workspace/result"

import { compareEntityVersionVectors, type EntityVersionVector } from "./cursor"
import type { EntityComponents, EntityReplicaInvocation } from "./mutations"
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
  ): Promise<Accepted<EntityComponents, EntityVersionVector>>
  pushEnvelope(
    envelope: MutationEnvelope<EntityReplicaInvocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<EntityReplicaRejection>>>
  subscribe(events: { onPing(): void; onReconnect(): void }): () => void
}

export interface EntityReplicaTransportOptions<Remote = void> {
  readonly source: EntityReplicaSource<Remote>
  /** The accepted tuple the replica was loaded with (the causal floor). */
  readonly initial: Accepted<EntityComponents, EntityVersionVector>
}

/**
 * Showtime's entity transport: Ably pings and reconnects trigger snapshot
 * refetches; every refetch runs through a pull generation (the "older
 * response finished last" race) and the causal acceptance gate keyed on the
 * per-class version vector. A ping is only ever an invalidation signal — the
 * gate, not the ping payload, decides causality, so a stale or echoed ping
 * costs one suppressed read instead of a wrong emission.
 */
export function createEntityReplicaTransport<Remote = void>(
  options: EntityReplicaTransportOptions<Remote>
): ReplicaTransport<
  EntityComponents,
  EntityReplicaInvocation,
  EntityReplicaRejection,
  Remote,
  EntityVersionVector
> {
  return {
    connect(sink) {
      let active = true
      const generations = createPullGenerationGate()
      const acceptance = createCausalAcceptanceGate<
        EntityComponents,
        EntityVersionVector
      >({
        initial: options.initial,
        classify: compareEntityVersionVectors,
        recover: (signal) => options.source.fetchAccepted(signal),
        emit: (accepted) => {
          if (active) sink.accept(accepted)
        },
      })

      const pull = (): void => {
        const generation = generations.begin()
        options.source.fetchAccepted(generation.signal).then(
          (snapshot) => {
            generation.publish(() => {
              // Emit (via the gate) before the liveness signal, so the sink
              // holds current accepted state before delivery resumes.
              acceptance.offer(snapshot)
              if (active) sink.alive()
            })
          },
          () => {
            if (active && !generation.signal.aborted) sink.down()
          }
        )
      }

      // Subscribe BEFORE the catch-up read (Codex P2, PR #382): a ping
      // landing while the catch-up is in flight schedules another
      // generation-gated pull instead of vanishing into the gap between
      // read and subscription — missed changes are closed by the read.
      const unsubscribe = options.source.subscribe({
        onPing: pull,
        onReconnect: pull,
      })
      pull()
      return () => {
        active = false
        unsubscribe()
        generations.cancel()
        acceptance.dispose()
      }
    },

    async push(envelope, signal) {
      try {
        return await options.source.pushEnvelope(envelope, signal)
      } catch (cause) {
        return err({ kind: "retryable", cause })
      }
    },
  }
}
