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

      const pull = (): void => {
        const generation = generations.begin()
        options.client.fetchSnapshot(generation.signal).then(
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

      // Subscribe before the catch-up pull: a tick landing during the pull
      // schedules another generation-gated pull instead of vanishing into
      // the gap between read and subscription.
      const unsubscribe = options.client.subscribeTicks(pull)
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
        return await options.client.pushEnvelope(envelope, signal)
      } catch (cause) {
        return err({ kind: "retryable", cause })
      }
    },
  }
}
