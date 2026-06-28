import { produce } from "immer"

import type { Session } from "../session"
import type { AilmentEvent } from "../session-event"

/**
 * Ailment overlay slice (R9; ports v1 `reduce/ailments.ts`). `setAilment` adds an
 * ailment key (idempotent — no duplicate); `clearAilment` removes the named key,
 * leaving the rest (clearing an absent key is a harmless no-change). Both are
 * **permissive**: the app tracks whatever the DM records and never enforces "one
 * non-Downed at a time" — co-existence (incl. `downed`) is the DM's table call,
 * order preserved as added. A **no-op (same-ref) for an unknown participant id**
 * (R9.4); works identically on every participant (the overlay is uniform).
 */
export function reduceAilment(session: Session, event: AilmentEvent): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    switch (event.kind) {
      case "setAilment":
        if (!participant.overlay.ailments.includes(event.ailment)) {
          participant.overlay.ailments.push(event.ailment)
        }
        return
      case "clearAilment":
        participant.overlay.ailments = participant.overlay.ailments.filter(
          (ailment) => ailment !== event.ailment
        )
        return
    }
  })
}
