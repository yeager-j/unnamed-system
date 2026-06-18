import { reduceDungeon } from "@workspace/game/engine"
import {
  isDungeonEvent,
  type DungeonEvent,
  type DungeonState,
  type MapInstanceEvent,
  type MapInstanceState,
  type Result,
} from "@workspace/game/foundation"

import type { UseQueuedWriteReturn } from "@/hooks/use-queued-write"
import { applyDungeonEvent } from "@/lib/actions/dungeon/events"
import type { ApplyDungeonEventError } from "@/lib/actions/dungeon/events.schema"
import { reduceMapInstance } from "@/lib/game-engine"

/** The Dungeon optimistic reducer the console's `useOptimistic` container runs —
 *  the turn-loop events only (`markActed`/`advanceTurn`); the same `reduceDungeon`
 *  the Server Action persists with. */
export function reduceDungeonOptimistic(
  current: DungeonState,
  event: DungeonEvent
): DungeonState {
  return reduceDungeon(current, event)
}

/** The Instance optimistic reducer for the dungeon console — in Play mode every
 *  spatial edit is a `moveCombatant`/reveal {@link MapInstanceEvent} through the
 *  pre-bound {@link reduceMapInstance} (no `addCombatant` cross-write here — that
 *  is combat's; a delve places tokens at start, not mid-turn). */
export function reduceDungeonInstanceOptimistic(
  current: MapInstanceState,
  event: MapInstanceEvent
): MapInstanceState {
  return reduceMapInstance(current, event)
}

/**
 * The dungeon console's routing brain — the exploration peer of
 * `dispatchCombatEvent`. It mirrors the right optimistic container and enqueues on
 * the right version queue, encoding the dungeon-vs-Instance two-row protocol once:
 *
 * - **Turn-loop event** (`markActed`/`advanceTurn`) → mirror the Dungeon container,
 *   enqueue on the **dungeon** queue (the action returns the bumped dungeon version).
 * - **Spatial event** (free-drag `moveCombatant`, reveal/hide/unlock) → mirror the
 *   Instance container, enqueue on the **Instance** queue (the action returns the
 *   bumped Instance version). The dungeon row isn't written, but the action schema
 *   carries `expectedVersion` regardless, so pass the dungeon ref (read fresh).
 *
 * The cross-container gestures (delve-start, search-that-reveals) are *not* here —
 * they are their own actions on the console hook, advancing both refs by hand.
 */
export async function dispatchDungeonEvent({
  event,
  dungeonId,
  applyDungeonOptimistic,
  applyInstanceOptimistic,
  dungeonWrite,
  instanceWrite,
}: {
  event: DungeonEvent | MapInstanceEvent
  dungeonId: string
  applyDungeonOptimistic: (event: DungeonEvent) => void
  applyInstanceOptimistic: (event: MapInstanceEvent) => void
  dungeonWrite: UseQueuedWriteReturn
  instanceWrite: UseQueuedWriteReturn
}): Promise<Result<{ version: number }, ApplyDungeonEventError>> {
  if (isDungeonEvent(event)) {
    applyDungeonOptimistic(event)
    return dungeonWrite.enqueue((expectedVersion) =>
      applyDungeonEvent({ dungeonId, expectedVersion, event })
    )
  }

  applyInstanceOptimistic(event)
  return instanceWrite.enqueue((expectedInstanceVersion) =>
    applyDungeonEvent({
      dungeonId,
      expectedVersion: dungeonWrite.versionRef.current,
      expectedInstanceVersion,
      event,
    })
  )
}
