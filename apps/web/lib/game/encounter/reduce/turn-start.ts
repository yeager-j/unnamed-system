import { produce } from "immer"

import type { CombatSession } from "../session"
import type { CombatSessionResult, StartCombatEvent } from "../session-event"

/**
 * Combat-start slice. `startCombat` records the DM's opening declaration on the
 * session: the `advantage` (players / enemies / neutral) and which side acts
 * first (`firstSide`). It is a no-op once `advantage` is non-null — an encounter
 * cannot start twice — returning the original session unchanged. Purely records
 * state; resolving `firstSide` (highest-Agility side) and the DB `draft → live`
 * status transition are the shell's job (UNN-332), so this slice emits no edits
 * and never touches status.
 */
export function reduceStartCombatEvent(
  session: CombatSession,
  event: StartCombatEvent
): CombatSessionResult {
  switch (event.kind) {
    case "startCombat": {
      if (session.advantage !== null) return { session, edits: [] }

      const next = produce(session, (draft) => {
        draft.advantage = event.advantage
        draft.firstSide = event.firstSide
      })

      return { session: next, edits: [] }
    }
  }
}
