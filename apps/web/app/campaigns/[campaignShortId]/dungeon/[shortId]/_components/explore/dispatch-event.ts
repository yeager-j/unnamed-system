import { type Result } from "@workspace/game-v2/kernel/result"
import {
  type DungeonEvent,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import type { DungeonConsoleAction } from "@/domain/dungeon/console-optimistic"
import { applyDungeonEvent } from "@/lib/actions/dungeon/events"
import {
  isDungeonEvent,
  type ApplyDungeonEventError,
} from "@/lib/actions/dungeon/events.schema"
import type { UseQueuedWriteReturn } from "@/lib/sync/use-queued-write"

/**
 * The dungeon console's routing brain — the exploration peer of
 * `dispatchCombatEvent`. It mirrors the event into the one optimistic container
 * (as the matching {@link DungeonConsoleAction}) and enqueues on the right
 * version queue, encoding the dungeon-vs-Instance two-row protocol once:
 *
 * - **Turn-loop event** (`markActed`/`advanceTurn`) → mirror `dungeon`, enqueue
 *   on the **dungeon** queue (the action returns the bumped dungeon version).
 * - **Spatial event** (free-drag `moveCombatant`, reveal/hide/unlock) → mirror
 *   `instance`, enqueue on the **Instance** queue (the action returns the bumped
 *   Instance version). The dungeon row isn't written, but the action schema
 *   carries `expectedVersion` regardless, so pass the dungeon ref (read fresh).
 *
 * The cross-container gestures (delve-start, search-that-reveals) are *not* here —
 * they are their own actions on the console hook, advancing both refs by hand.
 */
export async function dispatchDungeonEvent({
  event,
  dungeonId,
  applyOptimistic,
  dungeonWrite,
  instanceWrite,
}: {
  event: DungeonEvent | MapInstanceEvent
  dungeonId: string
  applyOptimistic: (action: DungeonConsoleAction) => void
  dungeonWrite: UseQueuedWriteReturn
  instanceWrite: UseQueuedWriteReturn
}): Promise<Result<{ version: number }, ApplyDungeonEventError>> {
  if (isDungeonEvent(event)) {
    applyOptimistic({ kind: "dungeonEvent", event })
    return dungeonWrite.enqueue((expectedVersion) =>
      applyDungeonEvent({ dungeonId, expectedVersion, event })
    )
  }

  applyOptimistic({ kind: "instanceEvent", event })
  return instanceWrite.enqueue((expectedInstanceVersion) =>
    applyDungeonEvent({
      dungeonId,
      expectedVersion: dungeonWrite.versionRef.current,
      expectedInstanceVersion,
      event,
    })
  )
}
