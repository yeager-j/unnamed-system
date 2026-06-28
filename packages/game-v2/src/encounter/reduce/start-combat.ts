import { produce } from "immer"

import type { Session } from "../session"
import type { StartCombatEvent } from "../session-event"

/**
 * Combat-start slice (R2; ports v1 `reduce/turn-start.ts`). `startCombat` records
 * the DM's opening declaration — `advantage` + `firstSide` — on the session
 * **verbatim** (no normalisation; keeping `firstSide` consistent with a
 * non-neutral advantage is the shell's invariant, R2.1). It is a **no-op once
 * `advantage` is non-null** — an encounter cannot start twice — returning the
 * original session reference (R2.2). It opens round 1 cleanly: nulls the current
 * actor and resets every participant's `turnsTakenThisRound` to 0 (R2.3), making
 * an event-assembled roster (joiners enter already-acted) all-eligible in round
 * 1. It never touches the DB status (`draft`/`live`) — the shell's job.
 */
export function reduceStartCombat(
  session: Session,
  event: StartCombatEvent
): Session {
  if (session.advantage !== null) return session

  return produce(session, (draft) => {
    draft.advantage = event.advantage
    draft.firstSide = event.firstSide
    draft.currentActorId = null
    for (const participant of draft.participants) {
      participant.overlay.turnState.turnsTakenThisRound = 0
    }
  })
}
