import { produce } from "immer"

import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { BattleConditionEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Battle-condition overlay slice — the *state* a combatant carries and *how long*
 * it lasts, both on the combatant overlay (UNN-310 / UNN-293):
 *
 * - `setBattleConditionAxis` sets one tri-state axis (Attack / Defense /
 *   Hit-Evasion) to its new state directly.
 * - `setBattleConditionFlag` toggles a single-use flag (Charged / Concentrating)
 *   on or off — manual, no auto-consume, no duration tick (UNN-294 policy).
 * - `applyBattleConditionDuration` sets or extends an axis's remaining turns:
 *   re-application **extends** rather than stacks (rulebook 3.8 — Tarukaja twice
 *   → 6 turns), so the new turns are added to whatever remains. It tracks *how
 *   long* only; expiry resets the axis state to `neutral` inside `endTurn` (ADR
 *   Decision 2).
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
      case "setBattleConditionAxis":
        combatant.battleConditions[event.axis] = event.state
        return
      case "setBattleConditionFlag":
        combatant.battleConditions[event.flag] = event.value
        return
      case "applyBattleConditionDuration":
        combatant.conditionDurations[event.axis] =
          (combatant.conditionDurations[event.axis] ?? 0) + event.turns
        return
    }
  })
}
