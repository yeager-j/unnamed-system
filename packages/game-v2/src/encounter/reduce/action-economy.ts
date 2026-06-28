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
 * consumption model). `adjustActionEconomy` adds a signed `delta` to one per-turn
 * action's consumption (`movesUsed` / `standardsUsed` / `reactionsUsed`),
 * **floored at 0 and unbounded above** — so a combatant can legitimately consume
 * 2+ of an action type (Tarantella's extra Move/Standard/Reaction, Follow-Ups'
 * extra Standard). Mirrors {@link import("./counters").reduceCounter}'s signed
 * nudge: delta-not-absolute lets back-to-back adjustments merge against the loaded
 * session. **Non-enforcing** — whether the extra action is *allowed* is the
 * DM/selector's call, never capped here; all three reset on `draftCombatant`. An
 * already-0 field with a negative delta stays 0, so Immer returns the same ref. A
 * **no-op (same-ref) for an unknown id**.
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
    const { turnState } = participant.overlay
    const field = USED_FIELD[event.action]
    turnState[field] = Math.max(0, turnState[field] + event.delta)
  })
}
