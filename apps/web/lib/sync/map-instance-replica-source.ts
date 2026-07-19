import type { ClientIdentity } from "@workspace/replica"
import type { PullTransportSource } from "@workspace/replica/transport"
import { err } from "@workspace/result"

import type {
  MapInstanceInvocation,
  MapInstanceReplicaState,
} from "@/domain/map/replica/mutations"
import type { MapInstanceReplicaRejection } from "@/domain/map/replica/rejection"
import { pushMapInstanceMutationAction } from "@/lib/actions/map-instance/replica/push"
import { loadMapInstanceAcceptedAction } from "@/lib/actions/map-instance/replica/snapshot"

import { createActionReplicaSource } from "./action-replica-source"

export type MapInstanceReplicaSource = PullTransportSource<
  MapInstanceReplicaState,
  MapInstanceInvocation,
  MapInstanceReplicaRejection,
  void,
  number
>

export function createMapInstanceReplicaSource(options: {
  readonly mapInstanceId: string
  readonly identity: ClientIdentity
  readonly subscribe: (invalidate: () => void) => () => void
  readonly invalidate: () => void
}): MapInstanceReplicaSource {
  const { mapInstanceId, identity, subscribe, invalidate } = options
  return createActionReplicaSource({
    async loadAccepted() {
      const result = await loadMapInstanceAcceptedAction({
        mapInstanceId,
        identity,
      })
      if (!result.ok) {
        return err(result.error)
      }
      return result
    },
    send: (envelope) =>
      pushMapInstanceMutationAction({ mapInstanceId, envelope }),
    subscribe,
    invalidWrite: "invalid-write" as const,
    describeReadFailure: (failure) =>
      `map instance accepted read refused: ${failure}`,
    onAcceptedPush: invalidate,
  })
}
