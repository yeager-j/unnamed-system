import { produce } from "immer"

import { BATTLE_CONDITION_AXIS_KEYS } from "@/lib/game/character"

import type { CombatSession } from "../session"
import type { CombatSessionResult, EndTurnEvent } from "../session-event"

/**
 * Turn-loop slice. `endTurn` ends the current actor's turn: they are marked as
 * having acted this round, and their battle-condition durations tick down by one
 * (durations decrement at the end of the *affected* combatant's own turn —
 * rulebook 3.8). Any axis reaching 0 auto-expires by resetting that combatant's
 * `battleConditions[axis]` overlay to `neutral` and dropping the duration — the
 * reducer mutates combat state in place rather than emitting an edit (ADR
 * Decision 2; UNN-331). The actor is **kept** as `currentActorId` so its
 * end-of-turn obligations stay addressable; clearing moves to `advanceRound`
 * (ADR Decision 8; UNN-306). With no current actor it is a no-op. Drafting the
 * *next* actor, round rollover, and Fallen-skip are added by the Turn-Order epic
 * (UNN-304/305/306).
 */
export function reduceTurnEvent(
  session: CombatSession,
  event: EndTurnEvent
): CombatSessionResult {
  switch (event.kind) {
    case "endTurn": {
      const actorId = session.currentActorId
      if (actorId === null) return { session, edits: [] }

      const next = produce(session, (draft) => {
        const actor = draft.combatants.find(
          (combatant) => combatant.id === actorId
        )
        if (actor === undefined) return
        actor.hasActedThisRound = true
        for (const axis of BATTLE_CONDITION_AXIS_KEYS) {
          const remaining = actor.conditionDurations[axis]
          if (remaining === undefined) continue
          if (remaining > 1) {
            actor.conditionDurations[axis] = remaining - 1
          } else {
            delete actor.conditionDurations[axis]
            actor.battleConditions[axis] = "neutral"
          }
        }
      })

      return { session: next, edits: [] }
    }
  }
}
