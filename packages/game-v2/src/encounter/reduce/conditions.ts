import { produce } from "immer"

import type { Session } from "../session"
import type { BattleConditionEvent } from "../session-event"
import {
  DEFAULT_BATTLE_CONDITION_TURNS,
  type BattleConditionState,
} from "../vocab"

/**
 * Battle-condition overlay slice (R8; ports v1 `reduce/conditions.ts`) — the axis
 * *state* plus *how long* it lasts, both on `participant.overlay`:
 *
 * - `adjustBattleConditionAxis` nudges one tri-state axis and drives its clock.
 *   `increase`/`decrease` set the axis to `increased`/`decreased` and start a
 *   `turns`-long clock (default {@link DEFAULT_BATTLE_CONDITION_TURNS}).
 *   Re-applying the **same** direction **extends** (adds to the remaining count,
 *   not stack); **flipping** direction **resets** the clock; `clear` returns the
 *   axis to `neutral` and drops the clock. The extend-vs-flip discriminator reads
 *   the **axis state** (`battleConditions[axis] === target`), not the duration
 *   entry — durations are a sibling overlay component. Decrement + auto-expiry
 *   happen on `endTurn`.
 * - `setBattleConditionFlag` toggles a single-use flag (charged / concentrating)
 *   on or off — manual, no auto-consume, no duration tick.
 *
 * A **no-op (same-ref) for an unknown participant id** (R8.6).
 */
export function reduceBattleCondition(
  session: Session,
  event: BattleConditionEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    const { battleConditions, conditionDurations } = participant.overlay

    switch (event.kind) {
      case "adjustBattleConditionAxis": {
        if (event.action === "clear") {
          battleConditions[event.axis] = "neutral"
          delete conditionDurations[event.axis]
          return
        }

        const target: BattleConditionState =
          event.action === "increase" ? "increased" : "decreased"
        const turns = event.turns ?? DEFAULT_BATTLE_CONDITION_TURNS

        if (battleConditions[event.axis] === target) {
          conditionDurations[event.axis] =
            (conditionDurations[event.axis] ?? 0) + turns
        } else {
          battleConditions[event.axis] = target
          conditionDurations[event.axis] = turns
        }
        return
      }
      case "setBattleConditionFlag":
        battleConditions[event.flag] = event.value
        return
    }
  })
}
