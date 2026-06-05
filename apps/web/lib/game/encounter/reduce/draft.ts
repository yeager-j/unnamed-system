import { produce } from "immer"

import type { CombatSession } from "../session"
import type { DraftCombatantEvent } from "../session-event"

/**
 * Draft slice. `draftCombatant` starts the named combatant's turn: it becomes the
 * `currentActorId`, its Downed ailment is cleared (the one *start*-of-turn effect
 * — Downed "clears at the start of the character's very next turn", rulebook 3.7),
 * and its action economy (Move / Standard / Reaction) is refreshed to available.
 * It does **not** set `hasActedThisRound` — that is `endTurn`'s job once the turn
 * is over. A no-op when the combatant id is unknown (Immer returns the original
 * session). The engine never blocks an "ineligible" pick (ADR Decision 8);
 * eligibility is the UI's advisory highlight via `nextDraftingSide`.
 *
 * The action-economy refresh is the start-of-turn hook (UNN-308), tied to
 * `draftCombatant` precisely because that fires only for a **normal** turn — a
 * Follow-Up is a bonus Standard Action that grants no fresh actions ("regaining
 * use of it at the start of your turn — not a Follow-Up", rulebook 3.1). v1 routes
 * Follow-Ups as prompts (UNN-318), not draft events, so they never reach this path
 * and the invariant holds by construction; keep it that way if a Follow-Up event
 * is ever added.
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
        combatant.moveAvailable = true
        combatant.standardAvailable = true
        combatant.reactionAvailable = true
        combatant.ailments = combatant.ailments.filter(
          (ailment) => ailment !== "downed"
        )
      })
  }
}
