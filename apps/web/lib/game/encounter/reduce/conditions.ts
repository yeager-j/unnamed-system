import { produce } from "immer"

import type { CombatSession } from "../session"
import type {
  BattleConditionEvent,
  CombatSessionResult,
} from "../session-event"

/**
 * Battle-condition duration slice. `applyBattleConditionDuration` sets or extends
 * a combatant's remaining turns on an axis: re-application **extends** rather
 * than stacks (rulebook 3.8 — Tarukaja twice → 6 turns), so the new turns are
 * added to whatever remains. It tracks *how long* only; the axis's
 * increased/decreased *state* lives on the combatant's `battleConditions`
 * overlay, and expiry resets that overlay to `neutral` inside `endTurn` (ADR
 * Decision 2). A no-op when the combatant id is unknown (Immer returns the
 * original session unchanged).
 */
export function reduceBattleConditionEvent(
  session: CombatSession,
  event: BattleConditionEvent
): CombatSessionResult {
  switch (event.kind) {
    case "applyBattleConditionDuration": {
      const next = produce(session, (draft) => {
        const combatant = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )
        if (combatant === undefined) return
        combatant.conditionDurations[event.axis] =
          (combatant.conditionDurations[event.axis] ?? 0) + event.turns
      })
      return { session: next, edits: [] }
    }
  }
}
