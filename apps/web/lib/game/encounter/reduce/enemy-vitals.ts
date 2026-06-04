import { produce } from "immer"

import type { CombatSession } from "../session"
import type { EnemyVitalsEvent } from "../session-event"

/**
 * Enemy-vitals slice (UNN-309). `adjustEnemyVitals` sets one field of an
 * **enemy** combatant's inline stat block to an absolute value. It is a **no-op
 * unless the target is an `enemy`-ref combatant** — a PC's vitals live on the
 * character row (written through the pools actions, never the session), and a
 * `catalog-enemy` carries no working-HP field yet (the deferred catalog-HP gap),
 * so neither is touched here. A no-op too when the id is unknown (Immer returns
 * the original session).
 *
 * `maxHP`/`maxSP` are floored at 0 to keep the stat block valid (its schema
 * requires non-negative maxes); `currentHP`/`currentSP` are left unbounded below
 * so overkill can drive them negative (per the `session.ts` comment). Mirrors
 * `reduce/conditions.ts`: find-by-id, mutate the Immer draft, return the session.
 */
export function reduceEnemyVitalsEvent(
  session: CombatSession,
  event: EnemyVitalsEvent
): CombatSession {
  switch (event.kind) {
    case "adjustEnemyVitals":
      return produce(session, (draft) => {
        const combatant = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )
        if (combatant === undefined || combatant.ref.kind !== "enemy") return

        const floored =
          event.field === "maxHP" || event.field === "maxSP"
            ? Math.max(0, event.value)
            : event.value
        combatant.ref.statBlock[event.field] = floored
      })
  }
}
