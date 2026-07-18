import { err, type Result } from "@workspace/result"

import type { MutationInvocation } from "../mutations"
import type { Accepted, MutationEnvelope, PushError } from "../protocol"
import {
  createCausalAcceptanceGate,
  createPullGenerationGate,
  type ReplicaTransport,
} from "../transport"

/**
 * The source interface for the deliberately alien reference adapter: a plain
 * HTTP-shaped client with a scalar cursor, no realtime stream, and no React.
 * Poll scheduling is injected (`subscribeTicks`) so production can wire a
 * timer while tests fire deterministic ticks.
 */
export interface PollingSourceClient<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  fetchSnapshot(signal: AbortSignal): Promise<Accepted<State, number>>
  pushEnvelope(
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<ApplyError>>>
  subscribeTicks(onTick: () => void): () => void
}

export interface PollingTransportOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  readonly client: PollingSourceClient<State, Invocation, ApplyError, Remote>
  /** The accepted tuple the replica was loaded with (the causal floor). */
  readonly initial: Accepted<State, number>
}

/**
 * The alien reference binding's transport: every poll runs through a pull
 * generation (so a slower older response cannot publish after a newer one)
 * and every response through the causal acceptance gate keyed on the scalar
 * cursor. Connection health derives from pull outcomes — there is no
 * streaming connection to observe.
 */
export function createPollingTransport<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
>(
  options: PollingTransportOptions<State, Invocation, ApplyError, Remote>
): ReplicaTransport<State, Invocation, ApplyError, Remote, number> {
  return {
    connect(sink) {
      let active = true
      let healthy: boolean | null = null
      const generations = createPullGenerationGate()
      const acceptance = createCausalAcceptanceGate<State, number>({
        initial: options.initial,
        classify: (previous, incoming) =>
          incoming < previous
            ? "stale"
            : incoming === previous
              ? "same"
              : "fresh",
        recover: (signal) => options.client.fetchSnapshot(signal),
        emit: (accepted) => {
          if (active) sink.accept(accepted)
        },
      })

      // Deliberately NOT transition-guarded: each successful pull is fresh
      // evidence of connectivity. A replica that self-disconnected after
      // exhausting its retry budget can only resume on such a signal when
      // the snapshot itself is unchanged (duplicate-suppressed), so the
      // stateless adapter must keep saying "connected". The replica treats
      // repeats as no-ops.
      const reportConnected = (): void => {
        if (!active) return
        healthy = true
        sink.setConnection("connected")
      }
      const reportDisconnected = (): void => {
        if (active && healthy !== false) {
          healthy = false
          sink.setConnection("disconnected")
        }
      }

      const pull = (): void => {
        const generation = generations.begin()
        options.client.fetchSnapshot(generation.signal).then(
          (snapshot) => {
            generation.publish(() => {
              // Emit (via the gate) before reporting connected, so the sink
              // holds current accepted state before delivery resumes.
              acceptance.offer(snapshot)
              reportConnected()
            })
          },
          () => {
            if (!generation.signal.aborted) reportDisconnected()
          }
        )
      }

      pull()
      const unsubscribe = options.client.subscribeTicks(pull)
      return () => {
        active = false
        unsubscribe()
        generations.cancel()
        acceptance.dispose()
      }
    },

    async push(envelope, signal) {
      try {
        return await options.client.pushEnvelope(envelope, signal)
      } catch (cause) {
        return err({ kind: "retryable", cause })
      }
    },
  }
}
