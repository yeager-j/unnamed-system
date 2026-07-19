import { err, ok, type Result } from "@workspace/result"

import {
  createReplica,
  type MutationError,
  type MutationReceipt,
  type Replica,
  type ReplicaEvent,
  type ReplicaSnapshot,
} from "./index"
import type { MutationInvocation, MutationRegistry } from "./mutations"
import type { Accepted, ClientIdentity } from "./protocol"
import type { ReplicaTransport } from "./transport"

export interface ManagedReplicaSetup<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> {
  readonly identity: ClientIdentity
  readonly initial: Accepted<State, Cursor>
  readonly transport: ReplicaTransport<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
}

export type ManagedBootstrapFailure<UnavailableReason = unknown> =
  | { readonly kind: "retryable"; readonly cause?: unknown }
  | { readonly kind: "unavailable"; readonly reason: UnavailableReason }

export type ManagedBootstrapResult<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
  UnavailableReason = unknown,
> = Result<
  ManagedReplicaSetup<State, Invocation, ApplyError, Remote, Cursor>,
  ManagedBootstrapFailure<UnavailableReason>
>

export type ManagedUnavailable<UnavailableReason = unknown> =
  | {
      readonly kind: "terminal"
      readonly reason: UnavailableReason
    }
  | {
      readonly kind: "retry-exhausted"
      readonly attempts: number
      readonly cause?: unknown
    }

export type ManagedMutationError<ApplyError, UnavailableReason = unknown> =
  | MutationError<ApplyError>
  | {
      readonly kind: "unavailable"
      readonly failure: ManagedUnavailable<UnavailableReason>
    }

export interface ManagedMutationReceipt<
  ApplyError,
  Remote = void,
  UnavailableReason = unknown,
> {
  readonly local: Promise<
    Result<void, ManagedMutationError<ApplyError, UnavailableReason>>
  >
  readonly remote: Promise<
    Result<Remote, ManagedMutationError<ApplyError, UnavailableReason>>
  >
}

export type ManagedReplicaState<
  State,
  ApplyError,
  UnavailableReason = unknown,
> =
  | { readonly status: "bootstrapping" }
  | {
      readonly status: "retrying"
      readonly attempt: number
      readonly maxAttempts: number
      readonly cause?: unknown
    }
  | {
      readonly status: "ready"
      readonly replica: ReplicaSnapshot<State, ApplyError>
    }
  | {
      readonly status: "expired"
      readonly dropped: number
    }
  | {
      readonly status: "unavailable"
      readonly failure: ManagedUnavailable<UnavailableReason>
    }
  | { readonly status: "disposing" }
  | { readonly status: "disposed" }

const BOOTSTRAP_RETRY_BASE_MS = 250
const BOOTSTRAP_RETRY_MAX_MS = 4_000
const BOOTSTRAP_RETRIES = 5
const BOOTSTRAP_MAX_ATTEMPTS = BOOTSTRAP_RETRIES + 1
const BOOTSTRAP_ATTEMPT_TIMEOUT_MS = 10_000

export interface ManagedReplicaOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
  UnavailableReason = unknown,
> {
  readonly mutations: MutationRegistry<State, Invocation, ApplyError>
  readonly bootstrap: (
    signal: AbortSignal
  ) => Promise<
    ManagedBootstrapResult<
      State,
      Invocation,
      ApplyError,
      Remote,
      Cursor,
      UnavailableReason
    >
  >
  readonly delivery?: { readonly retryBudget?: number }
  readonly onEvent?: (event: ReplicaEvent) => void
  readonly onAccepted?: () => void
  readonly onExpired?: (event: { readonly dropped: number }) => void
  readonly onUnavailable?: (
    failure: ManagedUnavailable<UnavailableReason>
  ) => void
}

export interface ManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  UnavailableReason = unknown,
> {
  getSnapshot(): ManagedReplicaState<State, ApplyError, UnavailableReason>
  subscribe(listener: () => void): () => void
  mutate(
    invocation: Invocation
  ): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  settleMutations(): Promise<Result<void, "pending-write-failed">>
  dispose(): void
}

const HANDOFF_MUTATION = Symbol("managed-replica-handoff-mutation")

interface ManagedReplicaWithHandoff<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
  UnavailableReason,
> extends ManagedReplica<
  State,
  Invocation,
  ApplyError,
  Remote,
  UnavailableReason
> {
  [HANDOFF_MUTATION](
    invocation: Invocation
  ): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
}

export function handoffManagedMutation<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
  UnavailableReason,
>(
  replica: ManagedReplica<
    State,
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  >,
  invocation: Invocation
): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason> {
  return (
    replica as ManagedReplicaWithHandoff<
      State,
      Invocation,
      ApplyError,
      Remote,
      UnavailableReason
    >
  )[HANDOFF_MUTATION](invocation)
}

export interface BufferedMutation<
  Invocation,
  ApplyError,
  Remote,
  UnavailableReason,
> {
  readonly invocation: Invocation
  readonly resolve: (
    receipt: ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  ) => void
}

export function settledManagedMutationReceipt<
  ApplyError,
  Remote,
  UnavailableReason,
>(
  failure: ManagedMutationError<ApplyError, UnavailableReason>
): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason> {
  const outcome = Promise.resolve(err(failure))
  return { local: outcome, remote: outcome }
}

function managedReceiptFromCore<ApplyError, Remote, UnavailableReason>(
  receipt: MutationReceipt<ApplyError, Remote>
): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason> {
  return { local: receipt.local, remote: receipt.remote }
}

export function proxiedManagedMutationReceipt<
  Invocation,
  ApplyError,
  Remote,
  UnavailableReason,
>(
  invocation: Invocation
): {
  entry: BufferedMutation<Invocation, ApplyError, Remote, UnavailableReason>
  receipt: ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
} {
  let resolveReceipt!: (
    receipt: ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  ) => void
  const receiptPromise = new Promise<
    ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  >((resolve) => {
    resolveReceipt = resolve
  })
  return {
    entry: { invocation, resolve: resolveReceipt },
    receipt: {
      local: receiptPromise.then((receipt) => receipt.local),
      remote: receiptPromise.then((receipt) => receipt.remote),
    },
  }
}

interface JournalEntry<ApplyError, Remote, UnavailableReason> {
  readonly sequence: number
  readonly remote: Promise<
    Result<Remote, ManagedMutationError<ApplyError, UnavailableReason>>
  >
}

export interface ManagedReceiptJournal<ApplyError, Remote, UnavailableReason> {
  track(
    receipt: ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  ): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  settle(): Promise<Result<void, "pending-write-failed">>
}

export function createManagedReceiptJournal<
  ApplyError,
  Remote,
  UnavailableReason,
>(): ManagedReceiptJournal<ApplyError, Remote, UnavailableReason> {
  let nextSequence = 1
  const entries = new Map<
    number,
    JournalEntry<ApplyError, Remote, UnavailableReason>
  >()

  return {
    track(receipt) {
      const sequence = nextSequence
      nextSequence += 1
      const entry = { sequence, remote: receipt.remote }
      entries.set(sequence, entry)
      void receipt.remote.then(
        (result) => {
          if (result.ok && entries.get(sequence) === entry) {
            entries.delete(sequence)
          }
        },
        () => {
          // A rejected promise is retained until a settlement barrier reports it.
        }
      )
      return receipt
    },

    async settle() {
      const boundary = nextSequence - 1
      const captured = [...entries.values()].filter(
        (entry) => entry.sequence <= boundary
      )
      const outcomes = await Promise.allSettled(
        captured.map((entry) => entry.remote)
      )
      for (const entry of captured) {
        if (entries.get(entry.sequence) === entry)
          entries.delete(entry.sequence)
      }
      const failed = outcomes.some(
        (outcome) => outcome.status === "rejected" || !outcome.value.ok
      )
      return failed ? err("pending-write-failed") : ok(undefined)
    },
  }
}

function retryDelay(attempt: number): number {
  return Math.min(
    BOOTSTRAP_RETRY_BASE_MS * 2 ** (attempt - 1),
    BOOTSTRAP_RETRY_MAX_MS
  )
}

export function createManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
  UnavailableReason = unknown,
>(
  options: ManagedReplicaOptions<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor,
    UnavailableReason
  >
): ManagedReplica<State, Invocation, ApplyError, Remote, UnavailableReason> {
  type Instance = Replica<State, Invocation, ApplyError, Remote>
  type StateSnapshot = ManagedReplicaState<State, ApplyError, UnavailableReason>
  type ManagedReceipt = ManagedMutationReceipt<
    ApplyError,
    Remote,
    UnavailableReason
  >

  let state: StateSnapshot = { status: "bootstrapping" }
  let instance: Instance | null = null
  let unsubscribeInstance: (() => void) | null = null
  let buffer: BufferedMutation<
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  >[] = []
  const listeners = new Set<() => void>()
  const journal = createManagedReceiptJournal<
    ApplyError,
    Remote,
    UnavailableReason
  >()
  let bootstrapGeneration = 0
  let bootstrapAbort: AbortController | null = null
  let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null
  let bootstrapTimeoutTimer: ReturnType<typeof setTimeout> | null = null

  function isolate(run: () => void): void {
    try {
      run()
    } catch {
      // Application callbacks never participate in lifecycle correctness.
    }
  }

  function notify(): void {
    for (const listener of [...listeners]) isolate(listener)
  }

  function transition(next: StateSnapshot): void {
    state = next
    notify()
  }

  function clearBootstrapClock(): void {
    if (bootstrapRetryTimer !== null) {
      clearTimeout(bootstrapRetryTimer)
      bootstrapRetryTimer = null
    }
    if (bootstrapTimeoutTimer !== null) {
      clearTimeout(bootstrapTimeoutTimer)
      bootstrapTimeoutTimer = null
    }
  }

  function cancelBootstrap(): void {
    bootstrapGeneration += 1
    clearBootstrapClock()
    bootstrapAbort?.abort()
    bootstrapAbort = null
  }

  function retireInstance(): Instance | null {
    const retired = instance
    unsubscribeInstance?.()
    unsubscribeInstance = null
    instance = null
    return retired
  }

  function settleBuffer(
    failure: ManagedMutationError<ApplyError, UnavailableReason>
  ): void {
    const buffered = buffer
    buffer = []
    for (const entry of buffered) {
      entry.resolve(
        settledManagedMutationReceipt<ApplyError, Remote, UnavailableReason>(
          failure
        )
      )
    }
  }

  function drainBuffer(target: Instance): void {
    const buffered = buffer
    buffer = []
    for (const entry of buffered) {
      entry.resolve(
        managedReceiptFromCore<ApplyError, Remote, UnavailableReason>(
          target.mutate(entry.invocation)
        )
      )
    }
  }

  function expireInstance(expired: Instance, dropped: number): void {
    if (instance !== expired) return
    retireInstance()
    queueMicrotask(() => expired.dispose())
    if (state.status === "disposing" || state.status === "disposed") return

    transition({ status: "expired", dropped })
    startBootstrap(1)
    isolate(() => options.onExpired?.({ dropped }))
  }

  function createInstance(
    setup: ManagedReplicaSetup<State, Invocation, ApplyError, Remote, Cursor>
  ): Instance {
    const created: Instance = createReplica({
      identity: setup.identity,
      initial: setup.initial,
      mutations: options.mutations,
      transport: setup.transport,
      delivery: options.delivery,
      onEvent: (event) => {
        if (event.kind === "expired") expireInstance(created, event.dropped)
        if (event.kind === "snapshot") {
          queueMicrotask(() => {
            if (state.status === "ready" && instance === created) {
              isolate(() => options.onAccepted?.())
            }
          })
        }
        isolate(() => options.onEvent?.(event))
      },
    })
    return created
  }

  function adoptInstance(created: Instance): void {
    instance = created
    unsubscribeInstance = created.subscribe(() => {
      if (instance !== created || state.status !== "ready") return
      const replica = created.getSnapshot()
      if (state.replica !== replica) transition({ status: "ready", replica })
    })
    transition({ status: "ready", replica: created.getSnapshot() })
    drainBuffer(created)
  }

  function enterUnavailable(
    failure: ManagedUnavailable<UnavailableReason>
  ): void {
    transition({ status: "unavailable", failure })
    settleBuffer({ kind: "unavailable", failure })
    isolate(() => options.onUnavailable?.(failure))
  }

  function handleBootstrapFailure(
    failure: ManagedBootstrapFailure<UnavailableReason>,
    attempt: number
  ): void {
    if (state.status === "disposing" || state.status === "disposed") {
      settleBuffer({ kind: "disposed" })
      return
    }
    if (failure.kind === "unavailable") {
      enterUnavailable({ kind: "terminal", reason: failure.reason })
      return
    }
    if (attempt >= BOOTSTRAP_MAX_ATTEMPTS) {
      enterUnavailable({
        kind: "retry-exhausted",
        attempts: attempt,
        ...(failure.cause === undefined ? {} : { cause: failure.cause }),
      })
      return
    }

    const nextAttempt = attempt + 1
    transition({
      status: "retrying",
      attempt: nextAttempt,
      maxAttempts: BOOTSTRAP_MAX_ATTEMPTS,
      ...(failure.cause === undefined ? {} : { cause: failure.cause }),
    })
    bootstrapRetryTimer = setTimeout(() => {
      bootstrapRetryTimer = null
      startBootstrap(nextAttempt)
    }, retryDelay(attempt))
  }

  function startBootstrap(attempt: number): void {
    if (state.status === "disposing" || state.status === "disposed") return
    clearBootstrapClock()
    const generation = bootstrapGeneration + 1
    bootstrapGeneration = generation
    const controller = new AbortController()
    bootstrapAbort = controller
    let completed = false

    function complete(
      result: ManagedBootstrapResult<
        State,
        Invocation,
        ApplyError,
        Remote,
        Cursor,
        UnavailableReason
      >
    ): void {
      if (completed) return
      completed = true
      if (bootstrapTimeoutTimer !== null) {
        clearTimeout(bootstrapTimeoutTimer)
        bootstrapTimeoutTimer = null
      }
      if (bootstrapGeneration !== generation) return
      bootstrapAbort = null

      if (!result.ok) {
        handleBootstrapFailure(result.error, attempt)
        return
      }
      if (state.status === "disposed") return

      const created = createInstance(result.value)
      if (state.status === "disposing") {
        instance = created
        drainBuffer(created)
        return
      }
      adoptInstance(created)
    }

    bootstrapTimeoutTimer = setTimeout(() => {
      controller.abort()
      complete(
        err({
          kind: "retryable",
          cause: {
            kind: "timeout",
            timeoutMs: BOOTSTRAP_ATTEMPT_TIMEOUT_MS,
          },
        })
      )
    }, BOOTSTRAP_ATTEMPT_TIMEOUT_MS)

    void Promise.resolve()
      .then(() => options.bootstrap(controller.signal))
      .then(complete, (cause) => complete(err({ kind: "retryable", cause })))
  }

  startBootstrap(1)

  function mutate(invocation: Invocation): ManagedReceipt {
    switch (state.status) {
      case "ready":
        return managedReceiptFromCore(instance!.mutate(invocation))
      case "bootstrapping":
      case "retrying": {
        const proxied = proxiedManagedMutationReceipt<
          Invocation,
          ApplyError,
          Remote,
          UnavailableReason
        >(invocation)
        buffer.push(proxied.entry)
        return proxied.receipt
      }
      case "expired":
        return settledManagedMutationReceipt({ kind: "expired" })
      case "unavailable":
        return settledManagedMutationReceipt({
          kind: "unavailable",
          failure: state.failure,
        })
      case "disposing":
        if (instance) {
          return managedReceiptFromCore(instance.mutate(invocation))
        }
        if (bootstrapAbort) {
          const proxied = proxiedManagedMutationReceipt<
            Invocation,
            ApplyError,
            Remote,
            UnavailableReason
          >(invocation)
          buffer.push(proxied.entry)
          return proxied.receipt
        }
        return settledManagedMutationReceipt({ kind: "disposed" })
      case "disposed":
        return settledManagedMutationReceipt({ kind: "disposed" })
    }
  }

  const managed: ManagedReplicaWithHandoff<
    State,
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  > = {
    getSnapshot: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    mutate: (invocation) => journal.track(mutate(invocation)),

    [HANDOFF_MUTATION]: mutate,

    settleMutations: () => journal.settle(),

    dispose() {
      if (state.status === "disposing" || state.status === "disposed") return
      clearBootstrapClock()
      transition({ status: "disposing" })
      setTimeout(() => {
        cancelBootstrap()
        settleBuffer({ kind: "disposed" })
        const retired = retireInstance()
        retired?.dispose()
        transition({ status: "disposed" })
        listeners.clear()
      }, 0)
    },
  }

  return managed
}
