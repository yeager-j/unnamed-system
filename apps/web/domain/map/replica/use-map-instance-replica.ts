"use client"

import { useCallback, useMemo } from "react"
import { toast } from "sonner"

import {
  createManagedBootstrap,
  createManagedReplica,
  type ManagedMutationReceipt,
} from "@workspace/replica"
import { useManagedReplica } from "@workspace/replica/react"
import {
  classifyScalarCursor,
  createPullTransport,
} from "@workspace/replica/transport"
import { type Result } from "@workspace/result"

import {
  loadMapInstanceAcceptedAction,
  type MapInstanceAcceptedError,
} from "@/lib/actions/map-instance/replica/snapshot"
import type { MapInstanceStatus } from "@/lib/db/schema/map-instance"
import { createMapInstanceReplicaSource } from "@/lib/sync/map-instance-replica-source"

import { mintMapInstanceIdentity } from "./identity"
import {
  mapInstanceMutations,
  prepareMapInstanceInvocation,
  type MapInstanceInvocation,
  type MapInstanceReplicaEvent,
  type MapInstanceReplicaRejection,
  type MapInstanceReplicaState,
} from "./mutations"

interface InvalidationBridge {
  subscribe(invalidate: () => void): () => void
  notify(): void
}

function createInvalidationBridge(mapInstanceId: string): InvalidationBridge {
  const listeners = new Set<() => void>()
  let channel: BroadcastChannel | null = null
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      if (channel === null && typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(`map-instance:${mapInstanceId}`)
        channel.addEventListener("message", emit)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          channel?.close()
          channel = null
        }
      }
    },
    notify() {
      emit()
      channel?.postMessage(null)
    },
  }
}

type UnavailableReason = MapInstanceAcceptedError

export interface UseMapInstanceReplicaReturn {
  readonly state: MapInstanceReplicaState["state"]
  readonly status: MapInstanceStatus
  mutate(
    event: MapInstanceReplicaEvent
  ): ManagedMutationReceipt<
    MapInstanceReplicaRejection,
    void,
    UnavailableReason
  >
  settle(): Promise<Result<void, "pending-write-failed">>
  notify(): void
}

export function useMapInstanceReplica(options: {
  readonly mapInstanceId: string
  readonly initial: MapInstanceReplicaState
}): UseMapInstanceReplicaReturn {
  const { mapInstanceId, initial } = options
  const bridge = useMemo(
    () => createInvalidationBridge(mapInstanceId),
    [mapInstanceId]
  )
  const create = useCallback(
    () =>
      createManagedReplica<
        MapInstanceReplicaState,
        MapInstanceInvocation,
        MapInstanceReplicaRejection,
        void,
        number,
        UnavailableReason
      >({
        mutations: mapInstanceMutations,
        bootstrap: createManagedBootstrap({
          mintIdentity: () => mintMapInstanceIdentity(mapInstanceId),
          loadAccepted: (identity) =>
            loadMapInstanceAcceptedAction({
              mapInstanceId,
              identity,
            }),
          createTransport: (identity, accepted) =>
            createPullTransport({
              source: createMapInstanceReplicaSource({
                mapInstanceId,
                identity,
                subscribe: bridge.subscribe,
                invalidate: bridge.notify,
              }),
              initial: accepted,
              classify: classifyScalarCursor,
            }),
        }),
        onExpired({ dropped }) {
          if (dropped > 0) {
            toast.error(
              "This map session expired — unsent changes were discarded. Reconnecting…"
            )
          }
        },
      }),
    [bridge, mapInstanceId]
  )
  const { state, mutate, settleMutations } = useManagedReplica({
    enabled: true,
    create,
  })

  const projected = state.status === "ready" ? state.replica.value : initial
  return {
    state: projected.state,
    status: projected.status,
    mutate: (event) =>
      mutate(prepareMapInstanceInvocation(projected.state, event)),
    settle: settleMutations,
    notify: bridge.notify,
  }
}
