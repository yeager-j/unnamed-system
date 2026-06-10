import { produce } from "immer"

import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { CounterEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Counter overlay slice — adjusts a named tally (Lumina, …) on a combatant.
 * **Permissive**, mirroring `reduce/ailments.ts`: the app tracks whatever the DM
 * records and enforces no cap (Lumina's per-caster Luck max is the DM's call).
 *
 * - `adjustCounter` adds `delta` to the current count (absent ⇒ 0), **floored at
 *   0**; the key is dropped when the result is 0 so the map stays sparse (the same
 *   positive-only invariant `countersSchema` declares). Delta-not-absolute lets
 *   back-to-back nudges merge against the loaded session rather than overwrite.
 * - `clearCounter` removes the counter outright.
 *
 * A no-op when the combatant id is unknown (Immer returns the original session).
 */
export function reduceCounterEvent(
  session: CombatSession,
  event: CounterEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find(
      (entry) => entry.id === event.combatantId
    )
    if (combatant === undefined) return

    switch (event.kind) {
      case "adjustCounter": {
        const next = Math.max(
          0,
          (combatant.counters[event.counter] ?? 0) + event.delta
        )
        if (next === 0) delete combatant.counters[event.counter]
        else combatant.counters[event.counter] = next
        return
      }
      case "clearCounter":
        delete combatant.counters[event.counter]
        return
    }
  })
}
