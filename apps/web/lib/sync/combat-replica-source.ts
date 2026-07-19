import type { ClientIdentity } from "@workspace/replica"
import type { PullTransportSource } from "@workspace/replica/transport"

import type {
  CombatDurableInvocation,
  CombatDurableState,
  CombatInlineInvocation,
  CombatInlineState,
} from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import {
  pushCombatDurableMutationAction,
  pushCombatSessionMutationAction,
} from "@/lib/actions/combat/replica/push"
import { loadCombatAcceptedAction } from "@/lib/actions/combat/replica/snapshot"
import type { CombatSessionRemote } from "@/lib/actions/combat/replica/wire.schema"

import { createPacedPushEnvelope } from "./replica-push"

export type CombatDurableSource = PullTransportSource<
  CombatDurableState,
  CombatDurableInvocation,
  CombatReplicaRejection,
  void,
  EntityVersionVector
>

export type CombatInlineSource = PullTransportSource<
  CombatInlineState,
  CombatInlineInvocation,
  CombatReplicaRejection,
  CombatSessionRemote,
  number
>

interface CombatSourceOptions {
  readonly encounterId: string
  readonly identity: ClientIdentity
  /** The invalidation feed, injected by the hook layer (the console stays
   *  the single realtime subscriber and fans pings in). */
  readonly subscribe: (invalidate: () => void) => () => void
}

/**
 * The production combat sources (UNN-646): the combat replica doors behind
 * the pull-source seam, sharing the entity source's push policy verbatim via
 * `createPacedPushEnvelope`. Refetches ride the same batched bootstrap door
 * with a single-root request — the door's registration insert doubles as the
 * living tab's `updatedAt` refresh, exactly like the entity door.
 */
export function createCombatDurableSource(
  options: CombatSourceOptions & { readonly entityId: string }
): CombatDurableSource {
  const { encounterId, entityId, identity, subscribe } = options
  return {
    async fetchAccepted(_signal) {
      const result = await loadCombatAcceptedAction({
        encounterId,
        durable: [{ entityId, identity }],
      })
      if (!result.ok) {
        throw new Error(`combat accepted read refused: ${result.error}`)
      }
      const accepted = result.value.durable[entityId]
      if (!accepted) {
        // Not served: the entity is no longer a durable participant of this
        // encounter. A throw is a failed pull (transport `down`), and the
        // roster diff disposes this replica on the next frame.
        throw new Error("combat accepted read: entity not in encounter")
      }
      return accepted
    },

    pushEnvelope: createPacedPushEnvelope({
      send: (envelope) =>
        pushCombatDurableMutationAction({ encounterId, entityId, envelope }),
      invalidWrite: "invalid-write",
    }),

    subscribe,
  }
}

export function createCombatInlineSource(
  options: CombatSourceOptions
): CombatInlineSource {
  const { encounterId, identity, subscribe } = options
  return {
    async fetchAccepted(_signal) {
      const result = await loadCombatAcceptedAction({
        encounterId,
        inline: identity,
      })
      if (!result.ok) {
        throw new Error(`combat accepted read refused: ${result.error}`)
      }
      if (!result.value.inline) {
        throw new Error("combat accepted read served no inline root")
      }
      return result.value.inline
    },

    pushEnvelope: createPacedPushEnvelope({
      send: (envelope) =>
        pushCombatSessionMutationAction({ encounterId, envelope }),
      invalidWrite: "invalid-write",
    }),

    subscribe,
  }
}
