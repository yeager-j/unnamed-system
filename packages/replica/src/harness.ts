import type { Result } from "@workspace/result"

import { settle } from "./contract/support"
import type { ReadGate } from "./contract/transport-laws"
import type { MutationInvocation } from "./mutations"
import type { Accepted, MutationEnvelope, PushError } from "./protocol"
import type { PullTransportSource } from "./transport"

export interface WrapAuthoritySourceOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> {
  /**
   * The current accepted tuple personalized to the client under test —
   * typically the in-memory authority handle's `accepted()` re-cursored by
   * the world (a version vector, a scalar, whatever the binding uses).
   */
  readonly accepted: () => Accepted<State, Cursor>
  /**
   * The push door — typically the in-memory authority handle's push, wrapped
   * by the world where an executed envelope must also advance its cursor.
   */
  readonly push: (
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ) => Promise<Result<Remote, PushError<ApplyError>>>
}

/**
 * The controllable source both contract suites drive: gateable reads,
 * severable network, doctorable observations, and a countable read log.
 */
export interface WrappedAuthoritySource<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> {
  /** Hand this to the binding's transport (or `createPullTransport`). */
  readonly source: PullTransportSource<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
  /** Every accepted tuple the source served (including doctored ones), in order. */
  observations(): ReadonlyArray<Accepted<State, Cursor>>
  /** Reads that have RESOLVED; a gated read counts when released. */
  reads(): number
  /** Fires the invalidation signal (a realtime ping / poll tick). */
  signal(): void
  /** Rejects subsequent reads until {@link restore}. */
  sever(): void
  /** Stops rejecting and fires the invalidation signal (the reconnect pull). */
  restore(): void
  /** Doctors the next read's tuple once — e.g. an incomparable racing observation. */
  doctorNext(
    doctor: (accepted: Accepted<State, Cursor>) => Accepted<State, Cursor>
  ): void
  /** Holds subsequent reads open; release them by arrival order to script races. */
  gate(): ReadGate
}

/**
 * Wraps an authority behind the pull-source seam with the controls the
 * contract suites need. Both Phase-2 bindings built this wrap by hand inside
 * their test worlds; the combat binding (UNN-646) was the second consumer
 * with the same shape — the tripwire that moved it into `testing`. The world
 * keeps what is genuinely its own: cursor construction (`accepted`) and
 * push-side cursor tracking (`push`).
 */
export function wrapAuthoritySource<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
>(
  options: WrapAuthoritySourceOptions<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
): WrappedAuthoritySource<State, Invocation, ApplyError, Remote, Cursor> {
  const observations: Accepted<State, Cursor>[] = []
  const invalidateHandlers = new Set<() => void>()
  const held: Array<{ released: boolean; resolve(): void }> = []
  let severed = false
  let gating = false
  let doctor:
    | ((accepted: Accepted<State, Cursor>) => Accepted<State, Cursor>)
    | null = null
  let resolvedReads = 0

  function fireSignal(): void {
    for (const handler of [...invalidateHandlers]) handler()
  }

  return {
    source: {
      fetchAccepted(_signal: AbortSignal) {
        if (severed) return Promise.reject(new Error("network severed"))
        let accepted = options.accepted()
        if (doctor) {
          accepted = doctor(accepted)
          doctor = null
        }
        observations.push(accepted)
        if (gating) {
          return new Promise<Accepted<State, Cursor>>((resolve) => {
            held.push({
              released: false,
              resolve: () => {
                resolvedReads += 1
                resolve(accepted)
              },
            })
          })
        }
        resolvedReads += 1
        return Promise.resolve(accepted)
      },
      pushEnvelope: (envelope, signal) => options.push(envelope, signal),
      subscribe(invalidate) {
        invalidateHandlers.add(invalidate)
        return () => invalidateHandlers.delete(invalidate)
      },
    },

    observations: () => [...observations],
    reads: () => resolvedReads,
    signal: fireSignal,
    sever: () => {
      severed = true
    },
    restore: () => {
      severed = false
      fireSignal()
    },
    doctorNext: (nextDoctor) => {
      doctor = nextDoctor
    },
    gate: () => {
      gating = true
      return {
        count: () => held.length,
        release: async (index: number) => {
          const entry = held[index]
          if (entry && !entry.released) {
            entry.released = true
            entry.resolve()
          }
          await settle(2)
        },
        releaseAll: async () => {
          for (const entry of held) {
            if (!entry.released) {
              entry.released = true
              entry.resolve()
            }
          }
          await settle(2)
        },
      }
    },
  }
}
