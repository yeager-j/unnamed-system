import { produce } from "immer"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { makeParticipant, type Session } from "../session"
import type { RosterEvent } from "../session-event"

type RosterCommand = Extract<
  RosterEvent,
  { kind: "addParticipant" | "removeParticipant" }
>

/**
 * Command-owned roster slice, the only reducer helper that mints ids (`newId`,
 * injected at the composition root):
 *
 * - `addParticipant` appends a fresh participant via {@link makeParticipant},
 *   entering already-acted (`hasActed: true` ⇒ `turnsTakenThisRound = 1`) so a
 *   mid-round joiner is queued for the next round (R6.2). Its id is the supplied
 *   `setup.id`, else `newId()`. The setup carries an **already-materialized**
 *   entity (catalog-free by type, CD4) — the reducer never reads a catalog.
 * - `removeParticipant` drops the matching participant and nulls `currentActorId`
 *   if it was the one removed. **No-op (same-ref) for an unknown id.** It does
 *   **NOT** sever the removed id from survivors' engagement (R6.3) — that is the
 *   Tier-3 occupancy-prune obligation the composition pairs in a transaction.
 * Round progression and side changes live in the shell-intent module.
 */
export function reduceRoster(
  session: Session,
  event: RosterCommand,
  newId: () => string
): Session {
  switch (event.kind) {
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
  }
}
