import { produce } from "immer"

import { makeCombatant, type CombatSession } from "../session"
import type { RoundEvent } from "../session-event"

/**
 * Round-lifecycle + roster slice. `advanceRound` rolls to the next round:
 * increment `round`, clear `currentActorId`, and reset every combatant's
 * `hasActedThisRound` — always producing a new session, even when no flag was
 * set (the idempotent round-end safeguard). `addCombatant` appends a fresh
 * combatant (see {@link makeCombatant}) with `hasActedThisRound = true`, so a
 * mid-round joiner is queued for the next round rather than acting this one.
 * `removeCombatant` drops the matching combatant and clears `currentActorId` if
 * it was the one removed (a no-op when the id is unknown — Immer returns the
 * original session). `newId` mints the joiner's stable id (mirrors
 * `reduceCharacter`'s injectable; the round/remove cases don't need it).
 */
export function reduceRoundEvent(
  session: CombatSession,
  event: RoundEvent,
  newId: () => string
): CombatSession {
  switch (event.kind) {
    case "advanceRound":
      return produce(session, (draft) => {
        draft.round += 1
        draft.currentActorId = null
        for (const combatant of draft.combatants) {
          combatant.hasActedThisRound = false
        }
      })

    case "addCombatant":
      return produce(session, (draft) => {
        draft.combatants.push(makeCombatant(event.setup, newId(), true))
      })

    case "removeCombatant":
      return produce(session, (draft) => {
        const index = draft.combatants.findIndex(
          (combatant) => combatant.id === event.combatantId
        )
        if (index === -1) return
        draft.combatants.splice(index, 1)
        if (draft.currentActorId === event.combatantId) {
          draft.currentActorId = null
        }
      })
  }
}
