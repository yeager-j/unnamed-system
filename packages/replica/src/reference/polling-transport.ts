import type { Result } from "@workspace/result"

import type { MutationInvocation } from "../mutations"
import type { Accepted, MutationEnvelope, PushError } from "../protocol"
import {
  classifyScalarCursor,
  createPullTransport,
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
 * The alien reference binding's transport: `createPullTransport` over the
 * polling client, with a tick as the invalidation signal and the scalar
 * cursor's total order as the classifier. Connection health derives from
 * pull outcomes — there is no streaming connection to observe.
 */
export function createPollingTransport<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
>(
  options: PollingTransportOptions<State, Invocation, ApplyError, Remote>
): ReplicaTransport<State, Invocation, ApplyError, Remote, number> {
  const { client } = options
  return createPullTransport({
    source: {
      fetchAccepted: (signal) => client.fetchSnapshot(signal),
      pushEnvelope: (envelope, signal) => client.pushEnvelope(envelope, signal),
      subscribe: (invalidate) => client.subscribeTicks(invalidate),
    },
    initial: options.initial,
    classify: classifyScalarCursor,
  })
}
