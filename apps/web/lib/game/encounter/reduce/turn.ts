import { produce } from "immer"

import { BATTLE_CONDITION_AXIS_KEYS } from "@/lib/game/character"

import type { CombatSession } from "../session"
import type {
  CombatSessionResult,
  EmittedEdit,
  TurnEvent,
} from "../session-event"

/**
 * Turn-loop slice. `endTurn` ends the current actor's turn: they are marked as
 * having acted this round, their battle-condition durations tick down by one
 * (durations decrement at the end of the *affected* combatant's own turn —
 * rulebook 3.8), any axis reaching 0 emits a `battleConditionAxis → neutral`
 * edit tagged with the combatant, and the floor is cleared (`currentActorId →
 * null`). With no current actor it is a no-op. Drafting the *next* actor, round
 * rollover, and Fallen-skip are added by the Turn-Order epic (UNN-304/305/306).
 */
export function reduceTurnEvent(
  session: CombatSession,
  event: TurnEvent
): CombatSessionResult {
  switch (event.kind) {
    case "endTurn": {
      const actorId = session.currentActorId
      if (actorId === null) return { session, edits: [] }

      const actor = session.combatants.find(
        (combatant) => combatant.id === actorId
      )

      // Expiry emissions are read off the pre-decrement state, so the producer
      // below only mutates the draft and carries no external side effects.
      const edits: EmittedEdit[] = []
      if (actor !== undefined) {
        for (const axis of BATTLE_CONDITION_AXIS_KEYS) {
          const remaining = actor.conditionDurations[axis]
          if (remaining !== undefined && remaining <= 1) {
            edits.push({
              combatantId: actorId,
              edit: { kind: "battleConditionAxis", axis, state: "neutral" },
            })
          }
        }
      }

      const next = produce(session, (draft) => {
        draft.currentActorId = null
        const drafted = draft.combatants.find(
          (combatant) => combatant.id === actorId
        )
        if (drafted === undefined) return
        drafted.hasActedThisRound = true
        for (const axis of BATTLE_CONDITION_AXIS_KEYS) {
          const remaining = drafted.conditionDurations[axis]
          if (remaining === undefined) continue
          if (remaining > 1) drafted.conditionDurations[axis] = remaining - 1
          else delete drafted.conditionDurations[axis]
        }
      })

      return { session: next, edits }
    }
  }
}
