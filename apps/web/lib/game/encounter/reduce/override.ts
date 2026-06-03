import { produce } from "immer"

import type { CombatSession } from "../session"
import type { OverrideEvent } from "../session-event"

/**
 * DM-override slice. Each event is a thin, **unconditional** mutation of one
 * turn-loop field — the engine guides but never rejects (ADR Decision 8), so
 * none of these guard against "wrong side", "already acted", or round order.
 * After any override the guiding selectors (`nextDraftingSide`,
 * `eligibleCombatants`, `pendingCombatants`) re-derive from the updated session,
 * so guidance stays correct with no cached pre-override state.
 *
 * - `setCurrentActor` points `currentActorId` at the given combatant regardless
 *   of which side the selectors would suggest. Clearing the actor is not a
 *   supported override — that is `advanceRound`.
 * - `setActed` sets one combatant's `hasActedThisRound` to the supplied value
 *   (a no-op when the id is unknown — Immer returns the original session).
 * - `setRound` sets `session.round` without touching any combatant flag.
 */
export function reduceOverrideEvent(
  session: CombatSession,
  event: OverrideEvent
): CombatSession {
  switch (event.kind) {
    case "setCurrentActor":
      return produce(session, (draft) => {
        draft.currentActorId = event.combatantId
      })

    case "setActed":
      return produce(session, (draft) => {
        const combatant = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )
        if (combatant === undefined) return
        combatant.hasActedThisRound = event.hasActed
      })

    case "setRound":
      return produce(session, (draft) => {
        draft.round = event.round
      })
  }
}
