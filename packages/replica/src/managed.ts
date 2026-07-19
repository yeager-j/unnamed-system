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

/**
 * Everything one bootstrap round mints: a fresh identity, the personalized
 * accepted floor read under that identity, and the transport bound to both.
 * The bootstrap read is where an authority REGISTERS the identity, so
 * registration provably precedes the first push; a rebuild after expiry calls
 * `bootstrap` again and gets a fresh identity, never reusing a dead one.
 */
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

/**
 * Why one bootstrap round could not produce a setup.
 *
 * - `retryable` — the setup MIGHT succeed later (a network failure, a 5xx, a
 *   thrown call). The managed layer owns backoff and re-attempts.
 * - `unavailable` — it will not. The root does not exist, the viewer may not
 *   have it, or the authority refused the request terminally. The controller
 *   stops, and buffered intent settles `unavailable` rather than hanging.
 *
 * A binding classifies its OWN door errors into these two; the package never
 * guesses from an application error code.
 */
export type ManagedBootstrapFailure =
  | { readonly kind: "retryable"; readonly cause?: unknown }
  | { readonly kind: "unavailable"; readonly reason?: unknown }

export type ManagedBootstrapResult<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> =
  | ManagedReplicaSetup<State, Invocation, ApplyError, Remote, Cursor>
  | ManagedBootstrapFailure

/** Bootstrap retry pacing — mirrors the push backoff so a flapping authority
 *  produces one recognisable cadence across both directions. */
const BOOTSTRAP_RETRY_BASE_MS = 250
const BOOTSTRAP_RETRY_MAX_MS = 4_000
const BOOTSTRAP_RETRY_ATTEMPTS = 5

export interface ManagedReplicaOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
> {
  readonly mutations: MutationRegistry<State, Invocation, ApplyError>
  /**
   * Mints an identity, registers it with the authority, and returns the
   * accepted floor + transport — or a {@link ManagedBootstrapFailure} saying
   * whether another attempt could help. A THROWN bootstrap is classified
   * `retryable`: a throw is ambiguous, and the retry budget bounds it.
   *
   * Every dispatch buffered during the bootstrap window reaches a
   * deterministic outcome: adopted by a later attempt, or settled
   * `unavailable` when the controller gives up. A bootstrap that can neither
   * succeed nor fail is a write black hole — the contract exists to make that
   * state unrepresentable.
   */
  readonly bootstrap: () => Promise<
    ManagedBootstrapResult<State, Invocation, ApplyError, Remote, Cursor>
  >
  readonly delivery?: { readonly retryBudget?: number }
  /** How many `retryable` bootstrap failures to absorb before the controller
   *  goes `unavailable`. Defaults to {@link BOOTSTRAP_RETRY_ATTEMPTS}. */
  readonly bootstrapRetries?: number
  /**
   * Metrics/logging sink, forwarded verbatim from the underlying replica.
   * **Observability only.** Its failure must never affect replica semantics —
   * the controller isolates it, and no lifecycle transition is sequenced
   * behind it. Never implement reconciliation on top of `ReplicaEvent`; use
   * {@link onAccepted} / {@link onExpired}, which are the semantic hooks.
   */
  readonly onEvent?: (event: ReplicaEvent) => void
  /**
   * Fires when an accepted observation has been incorporated — the authority's
   * state advanced as far as this client can see it, from ANY writer. This is
   * the hook an application refreshes other containers from.
   *
   * It deliberately says nothing about *whose* mutations the observation
   * carried: the incorporation watermark answers "which of MY mutations are
   * in", never "is this tuple free of everyone else's changes", so watermark
   * movement cannot be used to suppress a refresh.
   */
  readonly onAccepted?: () => void
  /**
   * Application policy for identity expiry (e.g. a toast when predictions
   * were dropped). The controller has already begun rebuilding under a fresh
   * identity when this fires.
   */
  readonly onExpired?: (event: { readonly dropped: number }) => void
}

/**
 * A replica whose bootstrap, rebuild, and disposal are managed. The surface
 * mirrors `Replica` (plus `settleMutations`); `getSnapshot` is null until a
 * bootstrap resolves and after expiry, unavailability, or disposal — callers
 * render their own frame in those windows.
 */
export interface ManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  getSnapshot(): ReplicaSnapshot<State, ApplyError> | null
  subscribe(listener: () => void): () => void
  /**
   * Predicts + delivers one mutation. Dispatches before the first bootstrap
   * resolves are buffered in order and replayed through the replica — the
   * receipt settles once the real one exists, or `unavailable` if no bootstrap
   * attempt ever succeeds. Dispatches during an expiry rebuild settle
   * `expired` instead: their intent belongs to a dead identity, and silently
   * re-issuing it under a fresh one could double-apply — the application
   * re-issues only what it judges safe.
   */
  mutate(invocation: Invocation): MutationReceipt<ApplyError, Remote>
  /** Waits for every tracked mutation to reach a trusted remote outcome. */
  settleMutations(): Promise<Result<void, "pending-write-failed">>
  /**
   * Tears down after ONE macrotask: cleanups that run parent-first (React
   * effect order) may still land fire-and-forget mutations through this
   * controller in the same commit, and those must find a live replica. A
   * bootstrap resolving after disposal drains the buffer through the
   * short-lived replica (the unmount-save flush), then lets it go.
   */
  dispose(): void
}

export interface BufferedMutation<Invocation, ApplyError, Remote> {
  readonly invocation: Invocation
  readonly resolve: (receipt: MutationReceipt<ApplyError, Remote>) => void
}

/** A receipt settled before entering any log (refused/disposed/expired). */
export function settledMutationReceipt<ApplyError, Remote>(
  failure: MutationError<ApplyError>
): MutationReceipt<ApplyError, Remote> {
  const outcome = Promise.resolve(err(failure))
  return { id: null, local: outcome, remote: outcome }
}

/**
 * A receipt that settles from a real one minted later — the buffered-dispatch
 * shape shared by the controller's bootstrap window and the React hook's
 * pre-effect window.
 *
 * `id` is a getter, not a captured `null`: the documented meaning of
 * `MutationReceipt.id` is "null iff no protocol ID was consumed", and a
 * buffered dispatch that is later adopted DOES consume one. A frozen `null`
 * would make an adopted mutation indistinguishable from a refused one.
 */
export function proxiedMutationReceipt<Invocation, ApplyError, Remote>(
  invocation: Invocation
): {
  entry: BufferedMutation<Invocation, ApplyError, Remote>
  receipt: MutationReceipt<ApplyError, Remote>
} {
  let adopted: MutationReceipt<ApplyError, Remote> | null = null
  let resolveReceipt!: (receipt: MutationReceipt<ApplyError, Remote>) => void
  const receiptPromise = new Promise<MutationReceipt<ApplyError, Remote>>(
    (resolve) => {
      resolveReceipt = resolve
    }
  )
  return {
    entry: {
      invocation,
      resolve: (receipt) => {
        adopted = receipt
        resolveReceipt(receipt)
      },
    },
    receipt: {
      get id() {
        return adopted?.id ?? null
      },
      local: receiptPromise.then((receipt) => receipt.local),
      remote: receiptPromise.then((receipt) => receipt.remote),
    },
  }
}

/**
 * Owns one replica's lifecycle around `createReplica` (extracted from the
 * entity binding's hook in UNN-646, once the combat binding needed the same
 * scaffolding): bootstrap-before-construction, ordered buffering during the
 * bootstrap window, bootstrap retry/terminal classification, receipt
 * settlement tracking, expiry rebuild under a fresh identity, and deferred
 * disposal. Framework-free — React callers wrap it with `useManagedReplica`;
 * imperative callers (a keyed set of replicas) drive it directly.
 *
 * **Two invariants the lifecycle owes its callers.** Every dispatch reaches a
 * terminal outcome — there is no phase in which a receipt stays unresolved
 * indefinitely. And every internal transition (expiry rebuild, terminal
 * unavailability, teardown) runs to completion independently of the
 * application callbacks that report it.
 */
export function createManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  Cursor = unknown,
>(
  options: ManagedReplicaOptions<State, Invocation, ApplyError, Remote, Cursor>
): ManagedReplica<State, Invocation, ApplyError, Remote> {
  type Receipt = MutationReceipt<ApplyError, Remote>
  type Instance = Replica<State, Invocation, ApplyError, Remote>

  /**
   * `bootstrapping` buffers dispatches (a retry between attempts is still this
   * phase); `ready` forwards them; `expired` (a rebuild in flight) refuses
   * them with `expired`; `unavailable` is the terminal no-replica-will-exist
   * phase; `disposing` is the one-macrotask grace window where the instance
   * still accepts unmount flushes; `disposed` refuses everything.
   */
  let phase:
    | "bootstrapping"
    | "ready"
    | "expired"
    | "unavailable"
    | "disposing"
    | "disposed" = "bootstrapping"
  let bootstrapInFlight = false
  let bootstrapAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let instance: Instance | null = null
  let unsubscribeInstance: (() => void) | null = null
  let buffer: BufferedMutation<Invocation, ApplyError, Remote>[] = []
  const listeners = new Set<() => void>()
  const unsettled = new Set<
    Promise<Result<Remote, MutationError<ApplyError>>>
  >()
  let settlementFailed = false
  const retryLimit = options.bootstrapRetries ?? BOOTSTRAP_RETRY_ATTEMPTS

  function notify(): void {
    for (const listener of [...listeners]) listener()
  }

  /**
   * Runs an APPLICATION callback where a lifecycle transition would otherwise
   * be sequenced behind it. A throwing logger, toast, or policy hook must
   * never be able to strand the controller — every internal transition
   * completes before its notification, and the notification cannot abort it.
   */
  function isolate(run: () => void): void {
    try {
      run()
    } catch {
      // Observability and application policy are not part of the protocol.
    }
  }

  const settledReceipt = settledMutationReceipt<ApplyError, Remote>

  function trackReceipt(receipt: Receipt): Receipt {
    const remote = receipt.remote
    unsettled.add(remote)
    void remote.then(
      (result) => {
        if (!result.ok) settlementFailed = true
        unsettled.delete(remote)
      },
      () => {
        settlementFailed = true
        unsettled.delete(remote)
      }
    )
    return receipt
  }

  function drainBuffer(target: Instance): void {
    const buffered = buffer
    buffer = []
    for (const entry of buffered) entry.resolve(target.mutate(entry.invocation))
  }

  function settleBuffer(failure: MutationError<ApplyError>): void {
    const buffered = buffer
    buffer = []
    for (const entry of buffered) entry.resolve(settledReceipt(failure))
  }

  function adoptInstance(created: Instance): void {
    instance = created
    unsubscribeInstance = created.subscribe(notify)
    phase = "ready"
    drainBuffer(created)
    notify()
  }

  function retireInstance(): void {
    unsubscribeInstance?.()
    unsubscribeInstance = null
    instance = null
  }

  function bootstrap(): void {
    bootstrapInFlight = true
    void options
      .bootstrap()
      .then(
        (result) => result,
        // A throw is ambiguous — it may be a transient network failure — so
        // it is retryable, never terminal.
        (cause): ManagedBootstrapFailure => ({ kind: "retryable", cause })
      )
      .then((result) => {
        bootstrapInFlight = false
        if ("kind" in result) return handleBootstrapFailure(result)

        bootstrapAttempt = 0
        const created = createReplica({
          identity: result.identity,
          initial: result.initial,
          mutations: options.mutations,
          transport: result.transport,
          delivery: options.delivery,
          onEvent: (event) => {
            // The internal transition runs FIRST and unconditionally; the
            // application sinks are notified after, isolated. Sequencing a
            // rebuild behind a logger is how a throwing sink strands a tab.
            if (event.kind === "expired" && instance === created) {
              expireInstance(created, event.dropped)
            }
            if (event.kind === "snapshot") {
              isolate(() => options.onAccepted?.())
            }
            isolate(() => options.onEvent?.(event))
          },
        })
        if (phase === "disposing" || phase === "disposed") {
          // Torn down mid-bootstrap with unmount saves in the buffer: flush
          // them through this short-lived replica (fire-and-forget, like the
          // classic path's unmount save), then let it go.
          drainBuffer(created)
          setTimeout(() => created.dispose(), 0)
          return
        }
        adoptInstance(created)
      })
  }

  function handleBootstrapFailure(failure: ManagedBootstrapFailure): void {
    if (phase === "disposing" || phase === "disposed") {
      // Nothing will ever drain the buffer: the teardown timer deferred to
      // this in-flight attempt, and the attempt came back empty.
      settleBuffer({ kind: "disposed" })
      return
    }
    if (failure.kind === "retryable" && bootstrapAttempt < retryLimit) {
      bootstrapAttempt += 1
      const delay = Math.min(
        BOOTSTRAP_RETRY_BASE_MS * 2 ** (bootstrapAttempt - 1),
        BOOTSTRAP_RETRY_MAX_MS
      )
      retryTimer = setTimeout(() => {
        retryTimer = null
        bootstrap()
      }, delay)
      return
    }
    // Terminal: either the binding said so, or the retry budget is spent.
    // Buffered intent settles here rather than waiting for a teardown that
    // may never come — an unresolvable receipt holds its caller's transition
    // open forever.
    phase = "unavailable"
    settleBuffer({ kind: "unavailable" })
    notify()
  }

  function expireInstance(expired: Instance, dropped: number): void {
    retireInstance()
    setTimeout(() => expired.dispose(), 0)
    if (phase === "disposing" || phase === "disposed") {
      // Expiry during the teardown grace: the mount is going away, so do not
      // resurrect the phase or rebuild under a fresh identity — a replacement
      // adopted here would outlive the disposal that was already scheduled.
      notify()
      return
    }
    phase = "expired"
    notify()
    // Rebuild sits on the guaranteed path, BEFORE the application is told.
    bootstrapAttempt = 0
    bootstrap()
    isolate(() => options.onExpired?.({ dropped }))
  }

  bootstrap()

  return {
    getSnapshot() {
      if (!instance || phase !== "ready") return null
      const snapshot = instance.getSnapshot()
      return snapshot.expired ? null : snapshot
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    mutate(invocation) {
      if (phase === "disposed") {
        return trackReceipt(settledReceipt({ kind: "disposed" }))
      }
      if (phase === "expired") {
        return trackReceipt(settledReceipt({ kind: "expired" }))
      }
      if (phase === "unavailable") {
        return trackReceipt(settledReceipt({ kind: "unavailable" }))
      }
      const current = instance
      if (current) return trackReceipt(current.mutate(invocation))
      // Bootstrap window: hold the intent, replay in order once the replica
      // exists. The proxied receipt settles from the real one.
      const { entry, receipt } = proxiedMutationReceipt<
        Invocation,
        ApplyError,
        Remote
      >(invocation)
      buffer.push(entry)
      return trackReceipt(receipt)
    },

    async settleMutations() {
      while (unsettled.size > 0) {
        await Promise.allSettled([...unsettled])
      }
      const failed = settlementFailed
      settlementFailed = false
      if (failed) return err("pending-write-failed")
      return ok(undefined)
    },

    dispose() {
      if (phase === "disposing" || phase === "disposed") return
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      phase = "disposing"
      notify()
      setTimeout(() => {
        phase = "disposed"
        // Read the instance at FIRE time, not at dispose time: capturing it
        // would dispose a replica that an intervening expiry had already
        // retired while leaving its replacement's transport live.
        const teardown = instance
        retireInstance()
        teardown?.dispose()
        // A bootstrap still in flight owns the buffer: it drains through the
        // short-lived replica (the unmount-save flush) or settles it if the
        // bootstrap comes back empty.
        if (!bootstrapInFlight) settleBuffer({ kind: "disposed" })
      }, 0)
    },
  }
}
