import type { ClientIdentity } from "@workspace/replica"
import type { PullTransportSource } from "@workspace/replica/transport"
import { err, ok } from "@workspace/result"

import type {
  CombatDurableInvocation,
  CombatDurableState,
  EncounterInvocation,
  EncounterReplicaState,
} from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import {
  pushCombatDurableMutationAction,
  pushCombatSessionMutationAction,
} from "@/lib/actions/combat/replica/push"
import { loadCombatAcceptedAction } from "@/lib/actions/combat/replica/snapshot"
import type { CombatSessionRemote } from "@/lib/actions/combat/replica/wire.schema"

import { createActionReplicaSource } from "./action-replica-source"

export type CombatDurableSource = PullTransportSource<
  CombatDurableState,
  CombatDurableInvocation,
  CombatReplicaRejection,
  void,
  EntityVersionVector
>

export type EncounterSource = PullTransportSource<
  EncounterReplicaState,
  EncounterInvocation,
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
  return createActionReplicaSource({
    async loadAccepted() {
      const result = await loadCombatAcceptedAction({
        encounterId,
        durable: [{ entityId, identity }],
      })
      if (!result.ok) {
        return err(`refused:${result.error}` as const)
      }
      const accepted = result.value.durable[entityId]
      if (!accepted) {
        // Not served: the entity is no longer a durable participant of this
        // encounter. A throw is a failed pull (transport `down`), and the
        // roster diff disposes this replica on the next frame.
        return err("entity-not-in-encounter" as const)
      }
      return ok(accepted)
    },
    send: (envelope) =>
      pushCombatDurableMutationAction({ encounterId, entityId, envelope }),
    subscribe,
    invalidWrite: "invalid-write" as const,
    describeReadFailure: (failure) =>
      failure === "entity-not-in-encounter"
        ? "combat accepted read: entity not in encounter"
        : `combat accepted read ${failure}`,
  })
}

export function createEncounterSource(
  options: CombatSourceOptions
): EncounterSource {
  const { encounterId, identity, subscribe } = options
  return createActionReplicaSource({
    async loadAccepted() {
      const result = await loadCombatAcceptedAction({
        encounterId,
        encounter: identity,
      })
      if (!result.ok) {
        return err(`refused:${result.error}` as const)
      }
      if (!result.value.encounter) {
        return err("missing-encounter-root" as const)
      }
      return ok(result.value.encounter)
    },
    send: (envelope) =>
      pushCombatSessionMutationAction({ encounterId, envelope }),
    subscribe,
    invalidWrite: "invalid-write" as const,
    describeReadFailure: (failure) =>
      failure === "missing-encounter-root"
        ? "combat accepted read served no encounter root"
        : `combat accepted read ${failure}`,
  })
}
