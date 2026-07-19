import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { err, ok, type Result } from "@workspace/result"

import type { Replica, ReplicaSnapshot } from "./index"
import {
  createManagedReceiptJournal,
  handoffManagedMutation,
  proxiedManagedMutationReceipt,
  settledManagedMutationReceipt,
  type BufferedMutation,
  type ManagedMutationReceipt,
  type ManagedReplica,
  type ManagedReplicaState,
} from "./managed"
import type { MutationInvocation } from "./mutations"

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
  UnavailableReason = unknown,
> {
  readonly enabled: boolean
  readonly create: () => ManagedReplica<
    State,
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  >
}

export interface UseManagedReplicaReturn<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  UnavailableReason = unknown,
> {
  readonly state: ManagedReplicaState<State, ApplyError, UnavailableReason>
  readonly mutate: (
    invocation: Invocation
  ) => ManagedMutationReceipt<ApplyError, Remote, UnavailableReason>
  readonly settleMutations: () => Promise<Result<void, "pending-write-failed">>
}

const BOOTSTRAPPING_STATE = { status: "bootstrapping" } as const
const DISPOSED_STATE = { status: "disposed" } as const

export function useManagedReplica<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
  UnavailableReason = unknown,
>({
  enabled,
  create,
}: UseManagedReplicaOptions<
  State,
  Invocation,
  ApplyError,
  Remote,
  UnavailableReason
>): UseManagedReplicaReturn<
  State,
  Invocation,
  ApplyError,
  Remote,
  UnavailableReason
> {
  type Controller = ManagedReplica<
    State,
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  >
  type Buffered = BufferedMutation<
    Invocation,
    ApplyError,
    Remote,
    UnavailableReason
  >

  const [controller, setController] = useState<Controller | null>(null)
  const controllerRef = useRef<Controller | null>(null)
  const preBufferRef = useRef<Buffered[]>([])
  const [preJournal] = useState(() =>
    createManagedReceiptJournal<ApplyError, Remote, UnavailableReason>()
  )

  function settlePreBuffer(): void {
    const buffered = preBufferRef.current
    preBufferRef.current = []
    for (const entry of buffered) {
      entry.resolve(
        settledManagedMutationReceipt<ApplyError, Remote, UnavailableReason>({
          kind: "disposed",
        })
      )
    }
  }

  useEffect(() => {
    if (!enabled) {
      settlePreBuffer()
      return
    }
    const created = create()
    controllerRef.current = created
    const buffered = preBufferRef.current
    preBufferRef.current = []
    for (const entry of buffered) {
      entry.resolve(handoffManagedMutation(created, entry.invocation))
    }
    setController(created)
    return () => {
      setController((current) => (current === created ? null : current))
      created.dispose()
      setTimeout(() => {
        if (controllerRef.current === created) controllerRef.current = null
      }, 0)
    }
  }, [enabled, create])

  useEffect(
    () => () => {
      settlePreBuffer()
    },
    []
  )

  const controllerState = useSyncExternalStore(
    (onStoreChange) =>
      controller ? controller.subscribe(onStoreChange) : () => {},
    () => (controller ? controller.getSnapshot() : BOOTSTRAPPING_STATE),
    () => BOOTSTRAPPING_STATE
  )
  const state = enabled ? controllerState : DISPOSED_STATE

  function mutate(
    invocation: Invocation
  ): ManagedMutationReceipt<ApplyError, Remote, UnavailableReason> {
    if (!enabled) {
      return preJournal.track(
        settledManagedMutationReceipt({ kind: "disposed" })
      )
    }
    const current = controllerRef.current
    if (current) return current.mutate(invocation)

    const { entry, receipt } = proxiedManagedMutationReceipt<
      Invocation,
      ApplyError,
      Remote,
      UnavailableReason
    >(invocation)
    preBufferRef.current.push(entry)
    return preJournal.track(receipt)
  }

  async function settleMutations(): Promise<
    Result<void, "pending-write-failed">
  > {
    const preEffect = preJournal.settle()
    const current = controllerRef.current
    const controlled = current
      ? current.settleMutations()
      : Promise.resolve(ok(undefined))
    const [preEffectResult, controlledResult] = await Promise.all([
      preEffect,
      controlled,
    ])
    return preEffectResult.ok && controlledResult.ok
      ? ok(undefined)
      : err("pending-write-failed")
  }

  return { state, mutate, settleMutations }
}
