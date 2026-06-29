import { produce } from "immer"

import { asParticipantId } from "../ids"
import { makeParticipant, type Session } from "../session"
import type { RosterEvent } from "../session-event"

/**
 * Round-lifecycle + roster slice (R6; ports v1 `reduce/round.ts`), the only slice
 * that mints ids (`newId`, injected at the composition root):
 *
 * - `advanceRound` rolls to the next round — increment `round`, null the actor,
 *   reset every participant's `turnsTakenThisRound` to 0 — **always** producing a
 *   new session (the idempotent round-end safeguard, R6.1).
 * - `addParticipant` appends a fresh participant via {@link makeParticipant},
 *   entering already-acted (`hasActed: true` ⇒ `turnsTakenThisRound = 1`) so a
 *   mid-round joiner is queued for the next round (R6.2). Its id is the supplied
 *   `setup.id`, else `newId()`. The setup carries an **already-materialized**
 *   entity (catalog-free by type, CD4) — the reducer never reads a catalog.
 * - `removeParticipant` drops the matching participant and nulls `currentActorId`
 *   if it was the one removed. **No-op (same-ref) for an unknown id.** It does
 *   **NOT** sever the removed id from survivors' engagement (R6.3) — that is the
 *   Tier-3 occupancy-prune obligation the composition pairs in a transaction.
 * - `setSide` flips a participant's allegiance side. **No-op for an unknown id.**
 */
export function reduceRoster(
  session: Session,
  event: RosterEvent,
  newId: () => string
): Session {
  switch (event.kind) {
    case "advanceRound":
      return produce(session, (draft) => {
        draft.round += 1
        draft.currentActorId = null
        for (const participant of draft.participants) {
          participant.overlay.turnState.turnsTakenThisRound = 0
        }
      })

    case "addParticipant":
      return produce(session, (draft) => {
        draft.participants.push(
          makeParticipant(
            event.setup.entity,
            event.setup.id ?? asParticipantId(newId()),
            {
              side: event.setup.side,
              hasActed: true,
            }
          )
        )
      })

    case "removeParticipant":
      return produce(session, (draft) => {
        const index = draft.participants.findIndex(
          (participant) => participant.id === event.participantId
        )
        if (index === -1) return
        draft.participants.splice(index, 1)
        if (draft.currentActorId === event.participantId) {
          draft.currentActorId = null
        }
      })

    case "setSide":
      return produce(session, (draft) => {
        const participant = draft.participants.find(
          (entry) => entry.id === event.participantId
        )
        if (participant === undefined) return
        participant.overlay.allegiance.side = event.side
      })
  }
}
