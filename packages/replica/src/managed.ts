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
   * accepted floor + transport. Returning `null` (or throwing) leaves the
   * controller unbootstrapped — the caller's read surface keeps rendering
   * its own frame, and buffered dispatches settle `disposed` at teardown.
   */
  readonly bootstrap: () => Promise<ManagedReplicaSetup<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  > | null>
  readonly delivery?: { readonly retryBudget?: number }
  /** Forwarded verbatim from the underlying replica (logging/metrics). */
  readonly onEvent?: (event: ReplicaEvent) => void
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
 * bootstrap resolves and after expiry or disposal — callers render their own
 * frame in those windows.
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
   * receipt settles once the real one exists. Dispatches during an expiry
   * rebuild settle `expired` instead: their intent belongs to a dead
   * identity, and silently re-issuing it under a fresh one could
   * double-apply — the application re-issues only what it judges safe.
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
 */
export function proxiedMutationReceipt<Invocation, ApplyError, Remote>(
  invocation: Invocation
): {
  entry: BufferedMutation<Invocation, ApplyError, Remote>
  receipt: MutationReceipt<ApplyError, Remote>
} {
  let resolveReceipt!: (receipt: MutationReceipt<ApplyError, Remote>) => void
  const receiptPromise = new Promise<MutationReceipt<ApplyError, Remote>>(
    (resolve) => {
      resolveReceipt = resolve
    }
  )
  return {
    entry: { invocation, resolve: resolveReceipt },
    receipt: {
      id: null,
      local: receiptPromise.then((receipt) => receipt.local),
      remote: receiptPromise.then((receipt) => receipt.remote),
    },
  }
}

/**
 * Owns one replica's lifecycle around `createReplica` (extracted from the
 * entity binding's hook in UNN-646, once the combat binding needed the same
 * scaffolding): bootstrap-before-construction, ordered buffering during the
 * bootstrap window, receipt settlement tracking, expiry rebuild under a
 * fresh identity, and deferred disposal. Framework-free — React callers wrap
 * it with `useManagedReplica`; imperative callers (a keyed set of replicas)
 * drive it directly.
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
   * `bootstrapping` buffers dispatches; `ready` forwards them; `expired`
   * (a rebuild in flight) refuses them with `expired`; `disposing` is the
   * one-macrotask grace window where the instance still accepts unmount
   * flushes; `disposed` refuses everything.
   */
  let phase: "bootstrapping" | "ready" | "expired" | "disposing" | "disposed" =
    "bootstrapping"
  let bootstrapInFlight = false
  let instance: Instance | null = null
  let unsubscribeInstance: (() => void) | null = null
  let buffer: BufferedMutation<Invocation, ApplyError, Remote>[] = []
  const listeners = new Set<() => void>()
  const unsettled = new Set<
    Promise<Result<Remote, MutationError<ApplyError>>>
  >()
  let settlementFailed = false

  function notify(): void {
    for (const listener of [...listeners]) listener()
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

  function settleBufferDisposed(): void {
    const buffered = buffer
    buffer = []
    for (const entry of buffered)
      entry.resolve(settledReceipt({ kind: "disposed" }))
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
      .catch(() => null)
      .then((setup) => {
        bootstrapInFlight = false
        if (setup === null) {
          // A refused/failed bootstrap after teardown: nothing will ever
          // drain the buffer, so settle it now.
          if (phase === "disposed") settleBufferDisposed()
          return
        }
        const created = createReplica({
          identity: setup.identity,
          initial: setup.initial,
          mutations: options.mutations,
          transport: setup.transport,
          delivery: options.delivery,
          onEvent: (event) => {
            options.onEvent?.(event)
            if (event.kind === "expired" && instance === created) {
              expireInstance(created, event.dropped)
            }
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

  function expireInstance(expired: Instance, dropped: number): void {
    retireInstance()
    phase = "expired"
    notify()
    setTimeout(() => expired.dispose(), 0)
    options.onExpired?.({ dropped })
    bootstrap()
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
      phase = "disposing"
      const teardown = instance
      notify()
      setTimeout(() => {
        phase = "disposed"
        retireInstance()
        teardown?.dispose()
        // A bootstrap still in flight owns the buffer: it drains through the
        // short-lived replica (the unmount-save flush) or settles it if the
        // bootstrap comes back empty.
        if (!bootstrapInFlight) settleBufferDisposed()
      }, 0)
    },
  }
}
