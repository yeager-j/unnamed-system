import type { ClientIdentity } from "@workspace/replica"

import type { EntityReplicaSource } from "@/domain/entity/replica/transport"
import { pushEntityMutationAction } from "@/lib/actions/entity/replica/push"
import { loadEntityAcceptedAction } from "@/lib/actions/entity/replica/snapshot"

import { createPacedPushEnvelope } from "./replica-push"

export interface EntityReplicaSourceOptions {
  readonly entityId: string
  readonly identity: ClientIdentity
  /**
   * The realtime half of the seam, injected by the hook layer: the Ably
   * character channel keyed by the entity's `shortId` (`onPing` per
   * invalidation ping, `onReconnect` after the realtime connection
   * re-establishes). Injected rather than imported so this module stays a
   * plain composition of the two Server Actions — the Ably client's React
   * lifecycle stays with the hook that owns it.
   */
  readonly subscribe: EntityReplicaSource["subscribe"]
}

/**
 * The production `EntityReplicaSource` (UNN-645): the two replica-door
 * Server Actions behind the transport seam. The push half — throw→retryable
 * classification (incl. Next navigation sentinels), exponential pacing, and
 * the protocol-dead/decode refusal mapping — is the shared
 * `createPacedPushEnvelope` (`replica-push.ts`, one policy for every replica
 * source; extracted in UNN-646 when the combat sources became its second and
 * third consumers).
 */
export function createEntityReplicaSource(
  options: EntityReplicaSourceOptions
): EntityReplicaSource {
  const { entityId, identity, subscribe } = options

  return {
    async fetchAccepted(_signal) {
      // Server Actions are not abortable; the transport's pull-generation
      // gate discards stale results instead, so the signal is advisory here.
      const result = await loadEntityAcceptedAction({ entityId, ...identity })
      if (!result.ok) {
        throw new Error(`entity accepted read refused: ${result.error}`)
      }
      return result.value
    },

    pushEnvelope: createPacedPushEnvelope({
      send: (envelope) => pushEntityMutationAction({ entityId, envelope }),
      invalidWrite: "invalid-write",
    }),

    subscribe,
  }
}
