import { produce } from "immer"

import type { CombatSession } from "../session"
import type { DraftCombatantEvent } from "../session-event"

/**
 * Draft slice. `draftCombatant` starts the named combatant's turn: it becomes the
 * `currentActorId`, its Downed ailment is cleared (the one *start*-of-turn effect
 * — Downed "clears at the start of the character's very next turn", rulebook 3.7),
 * and its reaction is refreshed (a normal turn restores Reactions). It does **not**
 * set `hasActedThisRound` — that is `endTurn`'s job once the turn is over. A no-op
 * when the combatant id is unknown (Immer returns the original session). The
 * engine never blocks an "ineligible" pick (ADR Decision 8); eligibility is the
 * UI's advisory highlight via `nextDraftingSide`.
 */
export function reduceDraftCombatantEvent(
  session: CombatSession,
  event: DraftCombatantEvent
): CombatSession {
  switch (event.kind) {
    case "draftCombatant":
      return produce(session, (draft) => {
        const combatant = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )
        if (combatant === undefined) return
        draft.currentActorId = combatant.id
        combatant.reactionAvailable = true
        combatant.ailments = combatant.ailments.filter(
          (ailment) => ailment !== "downed"
        )
      })
  }
}
