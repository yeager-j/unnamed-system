import { produce } from "immer"

import type { Session } from "../session"
import type { DraftCombatantEvent } from "../session-event"

/**
 * Draft slice (R4; ports v1 `reduce/draft.ts`). `draftCombatant` starts the named
 * participant's turn: it becomes the `currentActorId`, its action-economy
 * consumption resets to zero (all three actions available again), and its `downed`
 * ailment is cleared (the one start-of-turn effect — rulebook 3.7, kept all other
 * ailments via array-filter so the `AilmentKey[]` contract holds). It does **NOT**
 * touch `turnsTakenThisRound` (R4.1 — that is `endTurn`'s job). A **no-op for an
 * unknown id** (R4.2; Immer returns the original session). The engine never blocks
 * an "ineligible" pick (R4.3) — eligibility is the selectors' advisory highlight.
 */
export function reduceDraft(
  session: Session,
  event: DraftCombatantEvent
): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    draft.currentActorId = participant.id
    participant.overlay.turnState.movesUsed = 0
    participant.overlay.turnState.standardsUsed = 0
    participant.overlay.turnState.reactionsUsed = 0
    participant.overlay.ailments = participant.overlay.ailments.filter(
      (ailment) => ailment !== "downed"
    )
  })
}
