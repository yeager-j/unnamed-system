import type { CombatSession } from "../session"
import type { CombatSessionResult, TurnEvent } from "../session-event"
import { withCombatant } from "./shared"

/**
 * Turn-loop slice. Today it handles `endTurn`: the current actor's turn ends, so
 * they are marked as having acted this round and the floor is cleared
 * (`currentActorId → null`). With no current actor it is a no-op. Drafting the
 * *next* actor, round rollover, Fallen-skip, and the per-turn effects that emit
 * edits are added here by the Turn-Order epic (UNN-304/305/306/308) and the
 * duration/consumption clocks (UNN-293/294); `endTurn` emits no edits yet.
 */
export function reduceTurnEvent(
  session: CombatSession,
  event: TurnEvent
): CombatSessionResult {
  switch (event.kind) {
    case "endTurn": {
      const actorId = session.currentActorId
      if (actorId === null) return { session, edits: [] }

      const acted = withCombatant(session, actorId, (combatant) => ({
        ...combatant,
        hasActedThisRound: true,
      }))
      return {
        session: { ...acted, currentActorId: null },
        edits: [],
      }
    }
  }
}
