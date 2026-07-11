import type { CombatEvent } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { type Result } from "@workspace/game-v2/kernel/result"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import type { ConsoleOptimisticAction } from "@/domain/combat/console-optimistic"
import { applyCombatEventAction } from "@/lib/actions/combat/apply-event"
import type {
  AppliedCombatEvent,
  ApplyCombatEventError,
} from "@/lib/actions/combat/apply-event.schema"
import type { UseQueuedWriteReturn } from "@/lib/sync/use-queued-write"

/**
 * The `addParticipant` gesture as the console dispatches it: the wire setup
 * (client-minted `id` so the optimistic mirror and the server agree on the
 * roster key) with a two-arm entity source — `{ entity }` for an inline
 * combatant the client fully holds, `{ entityId }` for a durable PC joiner the
 * *server* hydrates from its character row (R6.2).
 */
export interface AddParticipantDispatch {
  kind: "addParticipant"
  setup: { id: ParticipantId; side: CombatSide; zoneId?: string } & (
    | { entity: Entity }
    | { entityId: string }
  )
}

/** Every event the console/setup surfaces dispatch through this router. */
export type ConsoleDispatchEvent =
  | Exclude<CombatEvent, { kind: "addParticipant" }>
  | AddParticipantDispatch
  | MapInstanceEvent

/**
 * The shared routing brain both combat write hooks (`useEncounterSetup`,
 * `useCombatConsole`) call from inside their pending transition — rewritten
 * onto engine v2 + {@link applyCombatEventAction} (UNN-535). It encodes the
 * dual-row protocol once: which optimistic arm an event mirrors, which version
 * queue serializes it, and how a cross-write reconciles both refs.
 *
 * Routing (by parse — the spatial and combat unions share no `kind`):
 * - **Pure spatial event** → mirror `{ kind: "event" }` on the one container,
 *   enqueue on the **Instance** queue (the action returns the bumped Instance
 *   version, which `instanceWrite` folds into its own ref). The encounter
 *   token rides along read fresh off the encounter ref.
 * - **`addParticipant`** → the inline arm mirrors `{ kind: "addPaired" }`; the
 *   durable arm (`{ entityId }`) mirrors **nothing** — the client has no
 *   entity to build the roster row from (the server hydrates it, R6.2), so the
 *   joiner appears on the RSC revalidation instead. Enqueued on the
 *   **encounter** queue. A **placed** add commits both rows in one txn, so the
 *   Instance ref hand-advances by one on success; a **zone-less** add is a
 *   session-only write — the Instance row is untouched and its ref must not
 *   move.
 * - **`removeParticipant`** → mirror `{ kind: "removePaired" }`, encounter
 *   queue. The server always persists **both** rows (the occupancy-sever runs
 *   even for a token-less participant — `applyRemoveParticipant` goes through
 *   `persistPaired` unconditionally), so the Instance ref always hand-advances
 *   by one on success.
 * - **Any other combat event** → mirror `{ kind: "event" }`, encounter queue.
 *
 * Every action call carries **both** version tokens, read fresh inside the
 * queue's serialized dispatch — never a stale outer-scope value (the UNN-226
 * trap). Both queues one-shot stale-retry through their own refetch
 * (`fetchEncounterVersion` / `fetchInstanceVersion`), wired where the queues
 * are built. The `applyOptimistic` mirror runs *outside* the action so React
 * paints the edit immediately; the server reduces the same event on the loaded
 * row.
 */
export async function dispatchCombatEvent({
  event,
  encounterId,
  applyOptimistic,
  encounterWrite,
  instanceWrite,
}: {
  event: ConsoleDispatchEvent
  encounterId: string
  applyOptimistic: (action: ConsoleOptimisticAction) => void
  encounterWrite: UseQueuedWriteReturn
  instanceWrite: UseQueuedWriteReturn
}): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  if (isMapInstanceEvent(event)) {
    applyOptimistic({ kind: "event", event })
    return instanceWrite.enqueue((expectedInstanceVersion) =>
      applyCombatEventAction({
        encounterId,
        expectedVersion: encounterWrite.versionRef.current,
        expectedInstanceVersion,
        event,
      })
    )
  }

  if (event.kind === "addParticipant") {
    return dispatchAddParticipant({
      event,
      encounterId,
      applyOptimistic,
      encounterWrite,
      instanceWrite,
    })
  }

  if (event.kind === "removeParticipant") {
    applyOptimistic({
      kind: "removePaired",
      participantId: event.participantId,
    })
    const result = await encounterWrite.enqueue((expectedVersion) =>
      applyCombatEventAction({
        encounterId,
        expectedVersion,
        expectedInstanceVersion: instanceWrite.versionRef.current,
        event,
      })
    )
    foldInstanceVersion(instanceWrite, result)
    return result
  }

  applyOptimistic({ kind: "event", event })
  return encounterWrite.enqueue((expectedVersion) =>
    applyCombatEventAction({
      encounterId,
      expectedVersion,
      expectedInstanceVersion: instanceWrite.versionRef.current,
      event,
    })
  )
}

async function dispatchAddParticipant({
  event,
  encounterId,
  applyOptimistic,
  encounterWrite,
  instanceWrite,
}: {
  event: AddParticipantDispatch
  encounterId: string
  applyOptimistic: (action: ConsoleOptimisticAction) => void
  encounterWrite: UseQueuedWriteReturn
  instanceWrite: UseQueuedWriteReturn
}): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const { setup } = event
  if ("entity" in setup) {
    applyOptimistic({
      kind: "addPaired",
      setup: { id: setup.id, side: setup.side, entity: setup.entity },
      zoneId: setup.zoneId,
    })
  }
  // The durable arm (`entityId`) mirrors nothing: the roster row's entity only
  // exists server-side (hydrated from the character row, R6.2) — the joiner
  // lands with the action's RSC revalidation.

  const result = await encounterWrite.enqueue((expectedVersion) =>
    applyCombatEventAction({
      encounterId,
      expectedVersion,
      expectedInstanceVersion: instanceWrite.versionRef.current,
      event,
    })
  )
  // Only a placed add writes the Instance row (the paired two-row txn) — the
  // action says so by returning the bumped Instance version; a zone-less add
  // is session-only, returns none, and the Instance ref doesn't move.
  foldInstanceVersion(instanceWrite, result)
  return result
}

/** Folds a paired write's returned Instance version into the Instance queue's
 *  token (forward-only) — the server's word for which rows it bumped, replacing
 *  the hand-advanced `+= 1` assumption (UNN-567). */
function foldInstanceVersion(
  instanceWrite: UseQueuedWriteReturn,
  result: Result<AppliedCombatEvent, ApplyCombatEventError>
): void {
  if (result.ok && result.value.instanceVersion !== undefined) {
    instanceWrite.bump(result.value.instanceVersion)
  }
}

/**
 * Routes an event to the spatial arm — the discriminated-union parse is a cheap
 * discriminator check (the engine's own routing doctrine, `reduce-encounter.ts`).
 */
function isMapInstanceEvent(
  event: ConsoleDispatchEvent
): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}
