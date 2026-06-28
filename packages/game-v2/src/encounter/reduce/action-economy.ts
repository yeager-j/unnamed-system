import { produce } from "immer"

import type { TurnState } from "../overlay"
import type { Session } from "../session"
import type { ActionEconomyAction, ActionEconomyEvent } from "../session-event"

/**
 * Maps an {@link ActionEconomyAction} to its {@link TurnState} **consumption**
 * field, so the slice stays a single write rather than a per-action switch.
 */
const USED_FIELD = {
  move: "movesUsed",
  standard: "standardsUsed",
  reaction: "reactionsUsed",
} as const satisfies Record<ActionEconomyAction, keyof TurnState>

/**
 * Action-economy slice (R11; ports v1 `reduce/action-economy.ts` onto the
 * consumption model). `setActionEconomy` flips one per-turn action toggle
 * (move / standard / reaction) on or off — mapped from v1's availability boolean
 * onto `TurnState` consumption against the constant base budget of 1: `available`
 * ⇒ `used = 0`, unavailable ⇒ `used = 1` (SUPERSEDE R11.1, observationally
 * identical at the 1/1/1 base). **Non-enforcing** — never blocks acting; all
 * three reset on `draftCombatant`. A **no-op (same-ref) for an unknown id**.
 */
export function reduceActionEconomy(
  session: Session,
  event: ActionEconomyEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return
    participant.overlay.turnState[USED_FIELD[event.action]] = event.available
      ? 0
      : 1
  })
}
