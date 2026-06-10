import { produce } from "immer"

import {
  DEFAULT_BATTLE_CONDITION_TURNS,
  type BattleConditionState,
} from "@workspace/game/foundation/character/state"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { BattleConditionEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Battle-condition overlay slice — the *state* a combatant carries and *how long*
 * it lasts, both on the combatant overlay (UNN-310 / UNN-293):
 *
 * - `adjustBattleConditionAxis` nudges one tri-state axis (Attack / Defense /
 *   Hit-Evasion) and drives its duration clock together. `increase`/`decrease`
 *   set the axis to `increased`/`decreased` and start a `turns`-long clock;
 *   re-applying the *same* direction **extends** rather than stacks (rulebook 3.8
 *   — Tarukaja twice → 6 turns), so the new turns are added to whatever remains.
 *   Flipping direction resets the clock. `clear` returns the axis to `neutral` and
 *   drops the clock. `turns` defaults to {@link DEFAULT_BATTLE_CONDITION_TURNS}.
 *   Decrement and expiry happen on `endTurn`, which resets the axis state to
 *   `neutral` at 0 (ADR Decision 2).
 * - `setBattleConditionFlag` toggles a single-use flag (Charged / Concentrating)
 *   on or off — manual, no auto-consume, no duration tick (UNN-294 policy).
 *
 * A no-op when the combatant id is unknown (Immer returns the original session
 * unchanged).
 */
export function reduceBattleConditionEvent(
  session: CombatSession,
  event: BattleConditionEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find(
      (entry) => entry.id === event.combatantId
    )
    if (combatant === undefined) return

    switch (event.kind) {
      case "adjustBattleConditionAxis": {
        if (event.action === "clear") {
          combatant.battleConditions[event.axis] = "neutral"
          delete combatant.conditionDurations[event.axis]
          return
        }

        const target: BattleConditionState =
          event.action === "increase" ? "increased" : "decreased"
        const turns = event.turns ?? DEFAULT_BATTLE_CONDITION_TURNS

        if (combatant.battleConditions[event.axis] === target) {
          combatant.conditionDurations[event.axis] =
            (combatant.conditionDurations[event.axis] ?? 0) + turns
        } else {
          combatant.battleConditions[event.axis] = target
          combatant.conditionDurations[event.axis] = turns
        }
        return
      }
      case "setBattleConditionFlag":
        combatant.battleConditions[event.flag] = event.value
        return
    }
  })
}
