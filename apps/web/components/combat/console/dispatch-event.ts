import type { CombatEvent } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

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
 * encounter protocol once: which optimistic arm an event mirrors and which
 * version queue serializes it. Spatial events are intercepted by the caller
 * and travel through the Map Instance Replica instead.
 *
 * Routing:
 * - **`addParticipant`** → the inline arm mirrors `{ kind: "addPaired" }`; the
 *   durable arm (`{ entityId }`) mirrors **nothing** — the client has no
 *   entity to build the roster row from (the server hydrates it, R6.2), so the
 *   joiner appears on the RSC revalidation instead. Enqueued on the
 *   **encounter** queue. A placed add still commits both rows in one server
 *   transaction, then the Map Instance Replica is invalidated by the caller.
 * - **`removeParticipant`** → mirror `{ kind: "removePaired" }`, encounter
 *   queue. The server always persists **both** rows (the occupancy-sever runs
 *   even for a token-less participant — `applyRemoveParticipant` goes through
 *   `persistPaired` unconditionally), so success carries a Map Replica
 *   invalidation cursor.
 * - **Any other combat event** → mirror `{ kind: "event" }`, encounter queue.
 *
 * Every action call carries the encounter token read fresh inside the queue's
 * serialized dispatch. The map row is locked and settled from current state by
 * the authority, so callers never coordinate it with a second client token.
 */
export async function dispatchCombatEvent({
  event,
  encounterId,
  applyOptimistic,
  encounterWrite,
}: {
  event: ConsoleDispatchEvent
  encounterId: string
  applyOptimistic: (action: ConsoleOptimisticAction) => void
  encounterWrite: UseQueuedWriteReturn
}): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
  if (isMapInstanceEvent(event)) return { ok: false, error: "invalid-input" }

  if (event.kind === "addParticipant") {
    return dispatchAddParticipant({
      event,
      encounterId,
      applyOptimistic,
      encounterWrite,
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
        event,
      })
    )
    return result
  }

  applyOptimistic({ kind: "event", event })
  return encounterWrite.enqueue((expectedVersion) =>
    applyCombatEventAction({
      encounterId,
      expectedVersion,
      event,
    })
  )
}

async function dispatchAddParticipant({
  event,
  encounterId,
  applyOptimistic,
  encounterWrite,
}: {
  event: AddParticipantDispatch
  encounterId: string
  applyOptimistic: (action: ConsoleOptimisticAction) => void
  encounterWrite: UseQueuedWriteReturn
}): Promise<Result<AppliedCombatEvent, ApplyCombatEventError>> {
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
      event,
    })
  )
  return result
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
