import { produce } from "immer"

import type { Session } from "../session"
import type { OverrideEvent } from "../session-event"

/**
 * DM-override slice (R7; ports v1 `reduce/override.ts`). Each event is a thin,
 * **unconditional** correction to one turn-loop field — the engine guides but
 * never rejects, so none guard against "wrong side" / "already acted" / round
 * order; the guiding selectors simply re-derive from the updated session.
 *
 * - `setCurrentActor` points `currentActorId` at the given id **unconditionally**,
 *   even an unknown/bogus id (R7.1). Clearing the actor is not an override — that
 *   is `advanceRound`.
 * - `setActed` maps an acted-boolean onto `turnsTakenThisRound`
 *   (`hasActed ? 1 : 0`; SUPERSEDE of v1's `hasActedThisRound`, R7.2), touching
 *   no other field. A **no-op (same-ref) for an unknown id** — contrast
 *   `setCurrentActor`'s unconditional write.
 * - `setRound` sets `round` to the supplied value with no clamp (R7.3).
 */
export function reduceOverride(
  session: Session,
  event: OverrideEvent
): Session {
  switch (event.kind) {
    case "setCurrentActor":
      return produce(session, (draft) => {
        draft.currentActorId = event.participantId
      })

    case "setActed":
      return produce(session, (draft) => {
        const participant = draft.participants.find(
          (entry) => entry.id === event.participantId
        )
        if (participant === undefined) return
        participant.overlay.turnState.turnsTakenThisRound = event.hasActed
          ? 1
          : 0
      })

    case "setRound":
      return produce(session, (draft) => {
        draft.round = event.round
      })
  }
}
