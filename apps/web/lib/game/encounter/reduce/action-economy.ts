import { produce } from "immer"

import type { CombatSession } from "../session"
import type { ActionEconomyAction, ActionEconomyEvent } from "../session-event"

/** Maps an {@link ActionEconomyAction} to the combatant's matching availability
 *  field, so the slice stays a single set rather than a per-action switch. */
const AVAILABILITY_FIELD = {
  move: "moveAvailable",
  standard: "standardAvailable",
  reaction: "reactionAvailable",
} as const satisfies Record<ActionEconomyAction, string>

/**
 * Action-economy slice (UNN-310). `setActionEconomy` flips one of a combatant's
 * per-turn action toggles (Move / Standard / Reaction) on or off. **Non-enforcing**
 * — it never blocks acting (ADR Decision 8); it is a tracking aid the DM eyeballs.
 * All three reset to available at the start of a normal turn via `draftCombatant`
 * (a Follow-Up draft does not reset them). A no-op when the combatant id is
 * unknown (Immer returns the original session). Mirrors `reduce/conditions.ts`.
 */
export function reduceActionEconomyEvent(
  session: CombatSession,
  event: ActionEconomyEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find(
      (entry) => entry.id === event.combatantId
    )
    if (combatant === undefined) return
    combatant[AVAILABILITY_FIELD[event.action]] = event.available
  })
}
