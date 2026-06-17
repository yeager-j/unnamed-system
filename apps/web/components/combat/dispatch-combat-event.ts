import { addOccupant, removeOccupant } from "@workspace/game/engine"
import {
  isMapInstanceEvent,
  type CombatEvent,
  type MapInstanceEvent,
  type MapInstanceState,
  type Result,
} from "@workspace/game/foundation"

import type { UseQueuedWriteReturn } from "@/hooks/use-queued-write"
import { applyCombatEvent } from "@/lib/actions/encounter/events"
import type { ApplyCombatEventError } from "@/lib/actions/encounter/events.schema"
import { reduceMapInstance } from "@/lib/game-engine"

/**
 * The optimistic action the Instance `useOptimistic` container reduces. Beyond a
 * wire {@link MapInstanceEvent} (a pure spatial edit), it carries the two
 * **occupancy cross-writes** that mirror an `addCombatant`/`removeCombatant`:
 * those are session-roster events the server applies to the Instance via the
 * `addOccupant`/`removeOccupant` pure helpers (they are deliberately **not**
 * `MapInstanceEvent`s — they never travel the spatial wire vocabulary), so the
 * optimistic mirror applies the same helpers here.
 */
export type InstanceOptimisticAction =
  | { kind: "spatial"; event: MapInstanceEvent }
  | { kind: "addOccupant"; combatantId: string; zoneId: string }
  | { kind: "removeOccupant"; combatantId: string }

/** The Instance optimistic reducer the hooks pass to `useOptimistic` — routes a
 *  spatial event through {@link reduceMapInstance} and an occupancy cross-write
 *  through the matching pure helper. */
export function reduceInstanceOptimistic(
  current: MapInstanceState,
  action: InstanceOptimisticAction
): MapInstanceState {
  switch (action.kind) {
    case "spatial":
      return reduceMapInstance(current, action.event)
    case "addOccupant":
      return addOccupant(current, action.combatantId, {
        zoneId: action.zoneId,
        engagement: { status: "free" },
      })
    case "removeOccupant":
      return removeOccupant(current, action.combatantId)
  }
}

/**
 * The shared routing brain both combat write hooks (`useEncounterSetup`,
 * `useCombatConsole`) call from inside their pending transition. It encodes the
 * UNN-459 dual-row protocol once — which optimistic container an event mirrors,
 * which version queue serializes it, and how the cross-write reconciles both
 * version refs — so the two hooks stay thin and can't drift on the load-bearing
 * concurrency logic.
 *
 * Routing by {@link isMapInstanceEvent} (and the two cross-write kinds):
 * - **Pure spatial event** → mirror the Instance container, enqueue on the
 *   **Instance** queue. The action returns the bumped *Instance* version, which
 *   `instanceWrite` folds into its own ref.
 * - **`addCombatant` / `removeCombatant`** (cross-write) → mirror **both**
 *   containers (the session reduce + the matching occupancy helper), enqueue on
 *   the **encounter** queue (the action returns the bumped *encounter* version).
 *   Since the server also bumped the Instance row by one in the same txn, advance
 *   `instanceWrite`'s ref by one **by hand** on success — the monotonic ref
 *   guarantees this never regresses a token a later write already moved.
 * - **Other session event** → mirror the session container, enqueue on the
 *   **encounter** queue.
 *
 * Every action call carries **both** version tokens (`expectedVersion` from the
 * encounter ref, `expectedInstanceVersion` from the Instance ref), read fresh
 * inside the queue's serialized dispatch — so back-to-back spatial edits read the
 * token their predecessor produced, never a stale outer-scope value (the UNN-226
 * trap). The `applyOptimistic` calls run *outside* the action so React mirrors
 * the edit immediately; the action reduces the same event server-side.
 */
export async function dispatchCombatEvent({
  event,
  encounterId,
  applySessionOptimistic,
  applyInstanceOptimistic,
  encounterWrite,
  instanceWrite,
}: {
  event: CombatEvent | MapInstanceEvent
  encounterId: string
  applySessionOptimistic: (event: CombatEvent) => void
  applyInstanceOptimistic: (action: InstanceOptimisticAction) => void
  encounterWrite: UseQueuedWriteReturn
  instanceWrite: UseQueuedWriteReturn
}): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  if (isMapInstanceEvent(event)) {
    applyInstanceOptimistic({ kind: "spatial", event })
    return instanceWrite.enqueue((expectedInstanceVersion) =>
      applyCombatEvent({
        encounterId,
        expectedVersion: encounterWrite.versionRef.current,
        expectedInstanceVersion,
        event,
      })
    )
  }

  if (event.kind === "addCombatant" || event.kind === "removeCombatant") {
    applySessionOptimistic(event)
    applyInstanceOptimistic(
      event.kind === "addCombatant"
        ? {
            kind: "addOccupant",
            combatantId: event.setup.id ?? "",
            zoneId: event.setup.zoneId,
          }
        : { kind: "removeOccupant", combatantId: event.combatantId }
    )
    const result = await encounterWrite.enqueue((expectedVersion) =>
      applyCombatEvent({
        encounterId,
        expectedVersion,
        expectedInstanceVersion: instanceWrite.versionRef.current,
        event,
      })
    )
    if (result.ok) {
      instanceWrite.versionRef.current += 1
    }
    return result
  }

  applySessionOptimistic(event)
  return encounterWrite.enqueue((expectedVersion) =>
    applyCombatEvent({
      encounterId,
      expectedVersion,
      expectedInstanceVersion: instanceWrite.versionRef.current,
      event,
    })
  )
}
