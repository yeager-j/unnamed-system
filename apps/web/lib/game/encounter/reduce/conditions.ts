import type { CombatSession } from "../session"
import type {
  BattleConditionEvent,
  CombatSessionResult,
} from "../session-event"
import { withCombatant } from "./shared"

/**
 * Battle-condition duration slice. `applyBattleConditionDuration` sets or extends
 * a combatant's remaining turns on an axis: re-application **extends** rather
 * than stacks (rulebook 3.8 — Tarukaja twice → 6 turns), so the new turns are
 * added to whatever remains. Session-only — it tracks *how long*; the character's
 * increased/decreased *state* is set through the existing combat-state action,
 * and expiry (the `→ neutral` edit) is emitted from `endTurn`. A no-op when the
 * combatant id is unknown.
 */
export function reduceBattleConditionEvent(
  session: CombatSession,
  event: BattleConditionEvent
): CombatSessionResult {
  switch (event.kind) {
    case "applyBattleConditionDuration": {
      const next = withCombatant(session, event.combatantId, (combatant) => ({
        ...combatant,
        conditionDurations: {
          ...combatant.conditionDurations,
          [event.axis]:
            (combatant.conditionDurations[event.axis] ?? 0) + event.turns,
        },
      }))
      return { session: next, edits: [] }
    }
  }
}
