import type { MutationInvocation } from "@workspace/replica"
import type {
  Accepted,
  PullTransportSource,
} from "@workspace/replica/transport"
import type { Result } from "@workspace/result"

import { createPacedPushEnvelope, type PushDoorError } from "./replica-push"

/**
 * Composes Showtime's Server Action adapters behind Replica's pull-source
 * seam. The caller owns addresses and action inputs; this module owns the
 * shared read-refusal, paced-push, and accepted-push invalidation protocol.
 */
export function createActionReplicaSource<
  State,
  Invocation extends MutationInvocation,
  Rejection,
  Remote,
  Cursor,
  ReadFailure,
>(options: {
  loadAccepted(
    signal: AbortSignal
  ): Promise<Result<Accepted<State, Cursor>, ReadFailure>>
  send(
    envelope: Parameters<
      PullTransportSource<
        State,
        Invocation,
        Rejection,
        Remote,
        Cursor
      >["pushEnvelope"]
    >[0]
  ): Promise<Result<Remote, PushDoorError<Rejection>>>
  readonly subscribe: (invalidate: () => void) => () => void
  readonly invalidWrite: NoInfer<Rejection>
  describeReadFailure(failure: ReadFailure): string
  readonly onAcceptedPush?: () => void
}): PullTransportSource<State, Invocation, Rejection, Remote, Cursor> {
  return {
    async fetchAccepted(signal) {
      const loaded = await options.loadAccepted(signal)
      if (!loaded.ok) throw new Error(options.describeReadFailure(loaded.error))
      return loaded.value
    },
    pushEnvelope: createPacedPushEnvelope({
      async send(envelope) {
        const result = await options.send(envelope)
        if (result.ok) options.onAcceptedPush?.()
        return result
      },
      invalidWrite: options.invalidWrite,
    }),
    subscribe: options.subscribe,
  }
}
