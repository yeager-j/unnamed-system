import { err, ok, type Result } from "@workspace/result"

import {
  validateArgs,
  type MutationDefinition,
  type MutationInvocation,
  type MutationRegistry,
} from "./mutations"
import type {
  Accepted,
  ClientIdentity,
  ConnectionStatus,
  MutationEnvelope,
  MutationId,
  PushError,
} from "./protocol"
import type { StandardSchemaV1 } from "./standard-schema"
import type { ReplicaTransport } from "./transport"

export type {
  Accepted,
  ClientIdentity,
  ConnectionStatus,
  MutationEnvelope,
  MutationId,
} from "./protocol"
export {
  defineMutation,
  defineMutations,
  type MutationContext,
  type MutationDefinition,
  type MutationFactory,
  type MutationInvocation,
  type MutationRegistry,
  type InvocationOf,
} from "./mutations"
export type { StandardSchemaV1 } from "./standard-schema"

/**
 * The caller-visible failure taxonomy. `refused` is a local prediction refusal
 * (the mutation never entered the pending log); `rejected` is the authority's
 * trusted terminal refusal; `invalid` is a schema refusal; `disposed` marks a
 * wait aborted by replica disposal.
 */
export type MutationError<ApplyError> =
  | { readonly kind: "disposed" }
  | {
      readonly kind: "invalid"
      readonly issues: ReadonlyArray<StandardSchemaV1.Issue>
    }
  | { readonly kind: "refused"; readonly error: ApplyError }
  | { readonly kind: "rejected"; readonly error: ApplyError }

/** A pending mutation whose `apply` refused during replay over a newer base. */
export interface MutationConflict<ApplyError> {
  readonly id: MutationId
  readonly name: string
  readonly error: ApplyError
}

export interface ReplicaSnapshot<State, ApplyError> {
  readonly value: State
  readonly pending: number
  readonly connection: ConnectionStatus
  readonly conflicts: ReadonlyArray<MutationConflict<ApplyError>>
}

/**
 * `local` resolves after validation, prediction, and insertion into the
 * pending log. `remote` resolves after the authority records a terminal
 * outcome. Neither promise means an accepted snapshot has incorporated the
 * mutation — the predicted effect stays mounted until incorporation arrives
 * through the accepted-state stream. `id` is null when the mutation was
 * refused before entering the pending log (no protocol identity was consumed:
 * delivered IDs must stay gapless, so a refused mutation cannot burn one).
 */
export interface MutationReceipt<ApplyError, Remote = void> {
  readonly id: MutationId | null
  readonly local: Promise<Result<void, MutationError<ApplyError>>>
  readonly remote: Promise<Result<Remote, MutationError<ApplyError>>>
}

export interface Replica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  getSnapshot(): ReplicaSnapshot<State, ApplyError>
  subscribe(listener: () => void): () => void
  mutate(invocation: Invocation): MutationReceipt<ApplyError, Remote>
  dispose(): void
}

export interface CreateReplicaOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> {
  readonly identity: ClientIdentity
  readonly initial: Accepted<State, Cursor>
  readonly mutations: MutationRegistry<State, Invocation, ApplyError>
  readonly transport: ReplicaTransport<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
  readonly delivery?: {
    /**
     * Ambiguous (retryable) push failures tolerated per connection epoch
     * before the replica transitions to `disconnected` and pauses delivery.
     * Backoff between attempts belongs to the transport's `push`.
     */
    readonly retryBudget?: number
  }
}

const DEFAULT_RETRY_BUDGET = 3

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

export function createReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
>(
  options: CreateReplicaOptions<State, Invocation, ApplyError, Remote, Cursor>
): Replica<State, Invocation, ApplyError, Remote> {
  type Failure = MutationError<ApplyError>

  interface PendingEntry {
    readonly envelope: MutationEnvelope<Invocation>
    readonly definition: MutationDefinition<State, string, unknown, ApplyError>
  }

  /**
   * Delivery bookkeeping is deliberately separate from the pending projection
   * log: an incorporated mutation may leave the projection before its lost
   * remote outcome has been recovered, and it must keep redelivering with the
   * same identity until the authority reports the recorded outcome.
   */
  interface LedgerEntry {
    readonly envelope: MutationEnvelope<Invocation>
    readonly remote: Deferred<Result<Remote, Failure>>
    settled: boolean
  }

  const { identity, mutations, transport } = options
  const retryBudget = options.delivery?.retryBudget ?? DEFAULT_RETRY_BUDGET

  let disposed = false
  let base: Accepted<State, Cursor> = options.initial
  let nextMutationId: MutationId = options.initial.through + 1
  // Delivery pauses while either holds: the transport reported the source
  // unreachable (`down()`), or the replica parked itself after exhausting
  // its retry budget. Both are cleared by the same level-triggered liveness
  // evidence (`alive()`, or an accepted snapshot, which implies it) — the
  // snapshot's ConnectionStatus is derived from these, never negotiated.
  let transportDown = false
  let parked = false
  let epochBudget = retryBudget

  let pending: PendingEntry[] = []
  const ledger: LedgerEntry[] = []
  let conflicts: ReadonlyArray<MutationConflict<ApplyError>> = []
  let projectedValue: State = options.initial.value

  const listeners = new Set<() => void>()
  const connection = (): ConnectionStatus =>
    transportDown || parked ? "disconnected" : "connected"
  let snapshot: ReplicaSnapshot<State, ApplyError> = {
    value: projectedValue,
    pending: 0,
    connection: connection(),
    conflicts,
  }

  let delivering = false
  let attemptController: AbortController | null = null

  function publish(): void {
    const previous = snapshot
    if (
      previous.value === projectedValue &&
      previous.pending === pending.length &&
      previous.connection === connection() &&
      previous.conflicts === conflicts
    ) {
      return
    }
    snapshot = {
      value: projectedValue,
      pending: pending.length,
      connection: connection(),
      conflicts,
    }
    for (const listener of [...listeners]) listener()
  }

  /**
   * Replays the pending log in ID order over the authoritative base. A replay
   * refusal removes the predicted effect and records a conflict, but leaves
   * later mutations replaying over the surviving projection — and leaves the
   * refused mutation's delivery untouched: the authority's terminal result
   * remains decisive.
   */
  function rebase(): void {
    let value = base.value
    const surviving: PendingEntry[] = []
    for (const entry of pending) {
      const applied = entry.definition.apply(
        value,
        entry.envelope.invocation.args,
        { phase: "rebase" }
      )
      if (applied.ok) {
        value = applied.value
        surviving.push(entry)
      } else {
        conflicts = [
          ...conflicts,
          {
            id: entry.envelope.mutationId,
            name: entry.envelope.invocation.name,
            error: applied.error,
          },
        ]
      }
    }
    pending = surviving
    projectedValue = value
  }

  function dropConflicts(predicate: (id: MutationId) => boolean): void {
    const remaining = conflicts.filter((conflict) => !predicate(conflict.id))
    if (remaining.length !== conflicts.length) conflicts = remaining
  }

  function settleRemote(
    entry: LedgerEntry,
    outcome: Result<Remote, Failure>
  ): void {
    entry.settled = true
    entry.remote.resolve(outcome)
    const index = ledger.indexOf(entry)
    if (index !== -1) ledger.splice(index, 1)
    dropConflicts((id) => id === entry.envelope.mutationId)
  }

  async function deliver(): Promise<void> {
    if (delivering) return
    delivering = true
    try {
      while (!disposed && !transportDown && !parked) {
        const head = ledger[0]
        if (!head) break

        const controller = new AbortController()
        attemptController = controller
        let outcome: Result<Remote, PushError<ApplyError>>
        try {
          outcome = await transport.push(head.envelope, controller.signal)
        } catch (cause) {
          outcome = err({ kind: "retryable", cause })
        } finally {
          attemptController = null
        }
        if (disposed) break

        if (outcome.ok) {
          // Terminal acceptance: the mutation stays in the pending log until
          // an accepted snapshot incorporates it.
          settleRemote(head, ok(outcome.value))
          publish()
          continue
        }

        if (outcome.error.kind === "rejected") {
          settleRemote(
            head,
            err({ kind: "rejected", error: outcome.error.error })
          )
          pending = pending.filter(
            (entry) => entry.envelope.mutationId !== head.envelope.mutationId
          )
          rebase()
          publish()
          continue
        }

        // Ambiguous: the authority may already have committed. Never resolve
        // `remote`, never re-identify, never advance past the head.
        if (epochBudget > 0) {
          epochBudget -= 1
          continue
        }
        parked = true
        publish()
        break
      }
    } finally {
      delivering = false
    }
  }

  function wake(): void {
    void deliver()
  }

  /** Delivery resumes from any outage with a fresh retry epoch. */
  function liveness(): void {
    if (!transportDown && !parked) return
    transportDown = false
    parked = false
    epochBudget = retryBudget
    wake()
  }

  const disconnect = transport.connect({
    accept(accepted) {
      if (disposed) return
      base = accepted
      if (accepted.through + 1 > nextMutationId) {
        nextMutationId = accepted.through + 1
      }
      pending = pending.filter(
        (entry) => entry.envelope.mutationId > accepted.through
      )
      dropConflicts((id) => id <= accepted.through)
      rebase()
      liveness()
      publish()
    },
    alive() {
      if (disposed) return
      liveness()
      publish()
    },
    down() {
      if (disposed || transportDown) return
      transportDown = true
      // A dead source makes any in-flight attempt ambiguous; abort it so the
      // delivery loop parks instead of hanging on a doomed await.
      attemptController?.abort()
      publish()
    },
  })

  function settledReceipt(
    failure: Failure
  ): MutationReceipt<ApplyError, Remote> {
    return {
      id: null,
      local: Promise.resolve(err(failure)),
      remote: Promise.resolve(err(failure)),
    }
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    mutate(invocation) {
      if (disposed) return settledReceipt({ kind: "disposed" })

      const definition = mutations.get(invocation.name)
      if (!definition) {
        throw new TypeError(
          `Unknown mutation "${invocation.name}" — not in this replica's registry`
        )
      }

      const validated = validateArgs(definition.args, invocation.args)
      if (!validated.ok) return settledReceipt(validated.error)

      const applied = definition.apply(projectedValue, validated.value, {
        phase: "optimistic",
      })
      if (!applied.ok) {
        return settledReceipt({ kind: "refused", error: applied.error })
      }

      const mutationId = nextMutationId
      nextMutationId += 1
      const envelope: MutationEnvelope<Invocation> = {
        ...identity,
        mutationId,
        invocation: {
          name: invocation.name,
          args: validated.value,
        } as Invocation,
      }

      pending.push({ envelope, definition })
      projectedValue = applied.value
      const remote = deferred<Result<Remote, Failure>>()
      ledger.push({ envelope, remote, settled: false })
      publish()
      wake()

      return {
        id: mutationId,
        local: Promise.resolve(ok(undefined)),
        remote: remote.promise,
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      disconnect()
      attemptController?.abort()
      for (const entry of [...ledger]) {
        if (!entry.settled) {
          entry.settled = true
          entry.remote.resolve(err({ kind: "disposed" }))
        }
      }
      ledger.length = 0
      listeners.clear()
    },
  }
}
