import { produce } from "immer"

import type { Session } from "../session"
import type { CounterEvent } from "../session-event"

/**
 * Counter overlay slice (R10; ports v1 `reduce/counters.ts`) — a named tally
 * (Lumina, Tells) on a participant. **Permissive** (no cap enforced):
 *
 * - `adjustCounter` adds a signed `delta` to the current count (absent ⇒ 0),
 *   **floored at 0**; the key is **deleted when the result is 0** so the map stays
 *   sparse (the positive-only invariant). Delta-not-absolute lets back-to-back
 *   nudges merge against the loaded session.
 * - `clearCounter` removes the counter outright (clearing an absent one is a
 *   harmless no-change).
 *
 * A **no-op (same-ref) for an unknown participant id** (R10.4).
 */
export function reduceCounter(session: Session, event: CounterEvent): Session {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === event.participantId
    )
    if (participant === undefined) return

    const { counters } = participant.overlay

    switch (event.kind) {
      case "adjustCounter": {
        const next = Math.max(0, (counters[event.counter] ?? 0) + event.delta)
        if (next === 0) delete counters[event.counter]
        else counters[event.counter] = next
        return
      }
      case "clearCounter":
        delete counters[event.counter]
        return
    }
  })
}
