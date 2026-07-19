"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import {
  createManagedBootstrap,
  createManagedReplica,
  type ManagedMutationReceipt,
  type ReplicaSnapshot,
} from "@workspace/replica"
import { useManagedReplica } from "@workspace/replica/react"
import { type Result } from "@workspace/result"

import {
  loadEntityAcceptedAction,
  type EntityAcceptedError,
} from "@/lib/actions/entity/replica/snapshot"
import { createEntityReplicaSource } from "@/lib/sync/entity-replica-source"

import type { EntityVersionVector } from "./cursor"
import { logEntityReplicaEvent } from "./events"
import { mintEntityClientIdentity } from "./identity"
import {
  entityReplicaMutations,
  type EntityReplicaInvocation,
  type EntityReplicaState,
} from "./mutations"
import type { EntityReplicaRejection } from "./rejection"
import { createEntityReplicaTransport } from "./transport"

export type EntityReplicaSnapshot = ReplicaSnapshot<
  EntityReplicaState,
  EntityReplicaRejection
>

export type EntityMutationReceipt = ManagedMutationReceipt<
  EntityReplicaRejection,
  void,
  EntityAcceptedError
>

interface RealtimeBridge {
  subscribe(events: { onPing(): void; onReconnect(): void }): () => void
  notifyPing(): void
  notifyReconnect(): void
}

/** Fans the provider's one realtime channel into the transport's seam — the
 *  provider stays the single Ably subscriber and forwards events here. */
function createRealtimeBridge(): RealtimeBridge {
  const handlers = new Set<{ onPing(): void; onReconnect(): void }>()
  return {
    subscribe(events) {
      handlers.add(events)
      return () => handlers.delete(events)
    },
    notifyPing() {
      for (const handler of [...handlers]) handler.onPing()
    },
    notifyReconnect() {
      for (const handler of [...handlers]) handler.onReconnect()
    },
  }
}

export interface UseEntityReplicaArgs {
  readonly entityId: string
  /** False for read-only mounts (a non-owner viewing a public sheet): the
   *  snapshot read is strict-owner, so bootstrapping would only 403. */
  readonly enabled: boolean
}

export interface UseEntityReplicaReturn {
  /** Null until the bootstrap read resolves (and always for `enabled: false`)
   *  — render the RSC-loaded frame until then. */
  readonly snapshot: EntityReplicaSnapshot | null
  /** Predicts + delivers one entity write. Mutations dispatched before the
   *  bootstrap resolves are buffered in order and replayed through the
   *  replica — the receipt settles once the real one exists. */
  readonly mutate: (
    invocation: EntityReplicaInvocation
  ) => EntityMutationReceipt
  /** Waits for current replica writes to reach trusted remote outcomes before
   *  a lifecycle action captures its semantic precondition. */
  readonly settleMutations: () => Promise<Result<void, "pending-write-failed">>
  /** Forward the provider's realtime channel events into the transport. */
  readonly notifyPing: () => void
  readonly notifyReconnect: () => void
}

/**
 * The entity binding over the managed replica lifecycle (UNN-645, thinned in
 * UNN-646 when the combat binding proved the scaffolding generic). What stays
 * here is Showtime policy:
 *
 * - **Bootstrap = registration.** `loadEntityAcceptedAction` REGISTERS the
 *   freshly minted identity (the push door refuses unregistered identities)
 *   and returns the personalized `initial`, so registration provably
 *   precedes the first push. A failed load leaves the hook on the RSC frame.
 * - **Expiry toast.** When the authority reports `unknown-client` the
 *   controller rebuilds under a fresh identity; this hook only decides what
 *   the user hears (a toast when predictions were dropped).
 * - **The realtime bridge.** The provider stays the single Ably subscriber
 *   and fans pings into the transport seam.
 */
export function useEntityReplica({
  entityId,
  enabled,
}: UseEntityReplicaArgs): UseEntityReplicaReturn {
  const [bridge] = useState(createRealtimeBridge)

  const create = useCallback(
    () =>
      createManagedReplica<
        EntityReplicaState,
        EntityReplicaInvocation,
        EntityReplicaRejection,
        void,
        EntityVersionVector,
        EntityAcceptedError
      >({
        mutations: entityReplicaMutations,
        bootstrap: createManagedBootstrap({
          mintIdentity: () => mintEntityClientIdentity(entityId),
          loadAccepted: (identity) =>
            loadEntityAcceptedAction({ entityId, ...identity }),
          createTransport: (identity, accepted) =>
            createEntityReplicaTransport({
              source: createEntityReplicaSource({
                entityId,
                identity,
                subscribe: bridge.subscribe,
              }),
              initial: accepted,
            }),
        }),
        onEvent: logEntityReplicaEvent,
        onExpired: ({ dropped }) => {
          if (dropped > 0) {
            toast.error(
              "This tab's live session expired — unsaved changes were discarded. Reconnecting…"
            )
          }
        },
      }),
    [entityId, bridge]
  )

  const { state, mutate, settleMutations } = useManagedReplica({
    enabled,
    create,
  })
  const snapshot = state.status === "ready" ? state.replica : null

  return {
    snapshot,
    mutate,
    settleMutations,
    notifyPing: () => bridge.notifyPing(),
    notifyReconnect: () => bridge.notifyReconnect(),
  }
}
