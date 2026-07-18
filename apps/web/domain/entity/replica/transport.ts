import {
  createCausalAcceptanceGate,
  createPullGenerationGate,
  type Accepted,
  type MutationEnvelope,
  type PushError,
  type ReplicaTransport,
} from "@workspace/replica/transport"
import { err, type Result } from "@workspace/result"

import type { EntityWriteRefusal } from "../commit/writers"
import { compareEntityVersionVectors, type EntityVersionVector } from "./cursor"
import type { EntityComponents, EntityReplicaInvocation } from "./mutations"

/**
 * The IO seam the entity replica transport is composed over. Production wires
 * these to the snapshot Server Action, the entity-write door, and the Ably
 * character channel (`onPing` per invalidation ping, `onReconnect` once after
 * a dropped realtime connection re-establishes); tests wire a controllable
 * fake. Keeping the seam as plain functions keeps this module pure — the
 * imperative shell (auth, fetch, Ably client) stays outside `domain/`.
 *
 * `pushEnvelope` contract (the guard-write lesson, 2026-07-11): a throw
 * reaching the transport is classified ambiguous-retryable and REDELIVERED.
 * The production source must therefore classify Next navigation signals
 * (`redirect`/`forbidden`/`unauthorized` throw sentinels) itself — the
 * delivery loop is a detached chain, so an `unstable_rethrow` here would be
 * inert, and letting the generic catch see them means an infinite retry
 * instead of a 403. Auth refusals are terminal `rejected` results, not
 * throws.
 */
export interface EntityReplicaSource<Remote = void> {
  fetchAccepted(
    signal: AbortSignal
  ): Promise<Accepted<EntityComponents, EntityVersionVector>>
  pushEnvelope(
    envelope: MutationEnvelope<EntityReplicaInvocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<EntityWriteRefusal>>>
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
  EntityWriteRefusal,
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

      // Deliberately NOT transition-guarded: each successful refetch is fresh
      // evidence of connectivity, and a replica that self-disconnected after
      // exhausting its retry budget can only resume on such a signal when the
      // snapshot itself is unchanged (duplicate-suppressed). The replica
      // treats repeats as no-ops.
      const reportConnected = (): void => {
        if (active) sink.setConnection("connected")
      }
      let reportedDown = false
      const reportDisconnected = (): void => {
        if (active && !reportedDown) {
          reportedDown = true
          sink.setConnection("disconnected")
        }
      }

      const pull = (): void => {
        const generation = generations.begin()
        options.source.fetchAccepted(generation.signal).then(
          (snapshot) => {
            generation.publish(() => {
              reportedDown = false
              acceptance.offer(snapshot)
              reportConnected()
            })
          },
          () => {
            if (!generation.signal.aborted) reportDisconnected()
          }
        )
      }

      // Catch-up: surface anything missed between load and subscribe before
      // claiming health.
      pull()
      const unsubscribe = options.source.subscribe({
        onPing: pull,
        onReconnect: pull,
      })
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
