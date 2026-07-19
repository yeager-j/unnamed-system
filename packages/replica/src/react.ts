import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { err, ok, type Result } from "@workspace/result"

import type {
  MutationError,
  MutationReceipt,
  Replica,
  ReplicaSnapshot,
} from "./index"
import {
  proxiedMutationReceipt,
  settledMutationReceipt,
  type BufferedMutation,
  type ManagedReplica,
} from "./managed"
import type { MutationInvocation } from "./mutations"

/**
 * The application owns where a replica instance lives (typically a
 * domain-specific context) and must not recreate it during render; the
 * runtime that creates it also owns `dispose`.
 */
export function useReplica<State, ApplyError>(
  replica: Replica<State, MutationInvocation, ApplyError, unknown>
): ReplicaSnapshot<State, ApplyError> {
  return useSyncExternalStore(
    replica.subscribe,
    replica.getSnapshot,
    replica.getSnapshot
  )
}

export interface UseManagedReplicaOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  /** False for read-only mounts: no bootstrap runs, dispatches settle `disposed`. */
  readonly enabled: boolean
  /**
   * Creates the controller (`createManagedReplica`); creation starts its
   * bootstrap, so this runs inside the effect. MUST be referentially stable
   * (memoize on the identity-defining inputs) — a new reference tears the
   * controller down and bootstraps a replacement.
   */
  readonly create: () => ManagedReplica<State, Invocation, ApplyError, Remote>
}

export interface UseManagedReplicaReturn<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  /** Null until the bootstrap read resolves (and always for `enabled: false`)
   *  — render the server-loaded frame until then. */
  readonly snapshot: ReplicaSnapshot<State, ApplyError> | null
  readonly mutate: (
    invocation: Invocation
  ) => MutationReceipt<ApplyError, Remote>
  /** Waits for current replica writes to reach trusted remote outcomes —
   *  including dispatches still buffered in the pre-effect window. */
  readonly settleMutations: () => Promise<Result<void, "pending-write-failed">>
}

/**
 * One managed replica's React lifecycle (extracted from the entity binding in
 * UNN-646): the controller is created in the effect (StrictMode-safe — a
 * replayed effect bootstraps a fresh identity; the abandoned one's dedup row
 * is reclaimed by the authority's TTL sweep) and disposed in the cleanup,
 * where the controller's one-macrotask teardown grace keeps same-commit
 * child unmount flushes working. Dispatches before the effect has created
 * the controller are buffered in order, exactly like the controller's own
 * bootstrap window.
 */
export function useManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
>({
  enabled,
  create,
}: UseManagedReplicaOptions<
  State,
  Invocation,
  ApplyError,
  Remote
>): UseManagedReplicaReturn<State, Invocation, ApplyError, Remote> {
  type Controller = ManagedReplica<State, Invocation, ApplyError, Remote>

  const [controller, setController] = useState<Controller | null>(null)
  const controllerRef = useRef<Controller | null>(null)
  const preBufferRef = useRef<
    BufferedMutation<Invocation, ApplyError, Remote>[]
  >([])
  // Pre-effect dispatches are tracked here as well as buffered: the
  // controller only starts tracking a receipt once it adopts one, so without
  // this `settleMutations` would report success over intent that has not been
  // sent yet.
  const preSettleRef = useRef<
    Promise<Result<Remote, MutationError<ApplyError>>>[]
  >([])

  useEffect(() => {
    if (!enabled) return
    const created = create()
    controllerRef.current = created
    const buffered = preBufferRef.current
    preBufferRef.current = []
    // The controller tracks each receipt it mints, so pre-effect tracking
    // hands over here rather than double-counting.
    preSettleRef.current = []
    for (const entry of buffered)
      entry.resolve(created.mutate(entry.invocation))
    setController(created)
    return () => {
      setController((current) => (current === created ? null : current))
      created.dispose()
      // The controller keeps accepting for one macrotask (unmount flushes);
      // only then does this mount stop routing dispatches to it.
      setTimeout(() => {
        if (controllerRef.current === created) controllerRef.current = null
      }, 0)
    }
  }, [enabled, create])

  const snapshot = useSyncExternalStore(
    (onStoreChange) =>
      controller ? controller.subscribe(onStoreChange) : () => {},
    () => (controller ? controller.getSnapshot() : null),
    () => null
  )

  function mutate(invocation: Invocation): MutationReceipt<ApplyError, Remote> {
    const current = controllerRef.current
    if (current) return current.mutate(invocation)
    if (!enabled) {
      return settledMutationReceipt<ApplyError, Remote>({ kind: "disposed" })
    }
    // Pre-effect window: hold the intent, replay in order once the effect
    // creates the controller.
    const { entry, receipt } = proxiedMutationReceipt<
      Invocation,
      ApplyError,
      Remote
    >(invocation)
    preBufferRef.current.push(entry)
    preSettleRef.current.push(receipt.remote)
    return receipt
  }

  async function settleMutations(): Promise<
    Result<void, "pending-write-failed">
  > {
    // Drain the pre-effect receipts first: each resolves once the controller
    // adopts it (or settles it terminally), so awaiting them is what makes
    // "settled" true for a caller that dispatched before the effect ran.
    const buffered = preSettleRef.current.splice(0)
    const outcomes = await Promise.allSettled(buffered)
    const bufferedFailed = outcomes.some(
      (outcome) => outcome.status === "rejected" || !outcome.value.ok
    )
    const current = controllerRef.current
    const settled = current ? await current.settleMutations() : ok(undefined)
    if (bufferedFailed) return err("pending-write-failed")
    return settled
  }

  return { snapshot, mutate, settleMutations }
}
