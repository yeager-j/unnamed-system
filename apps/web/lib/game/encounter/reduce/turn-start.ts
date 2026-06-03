import { produce } from "immer"

import type { CombatSession } from "../session"
import type { StartCombatEvent } from "../session-event"

/**
 * Combat-start slice. `startCombat` records the DM's opening declaration on the
 * session: the `advantage` (players / enemies / neutral) and which side acts
 * first (`firstSide`). It is a no-op once `advantage` is non-null — an encounter
 * cannot start twice — returning the original session unchanged. It records the
 * `{ advantage, firstSide }` pair **verbatim** and does not normalise it: keeping
 * `firstSide` consistent with a non-neutral `advantage` is the shell's invariant
 * (UNN-332), not the reducer's, so this stays a pure, total recorder. Resolving
 * `firstSide` (highest-Agility side) and the DB `draft → live` status transition
 * are likewise the shell's job, so this slice never touches status.
 */
export function reduceStartCombatEvent(
  session: CombatSession,
  event: StartCombatEvent
): CombatSession {
  switch (event.kind) {
    case "startCombat": {
      if (session.advantage !== null) return session

      return produce(session, (draft) => {
        draft.advantage = event.advantage
        draft.firstSide = event.firstSide
      })
    }
  }
}
