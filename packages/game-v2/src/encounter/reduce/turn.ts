import { produce } from "immer"

import type { Session } from "../session"
import { BATTLE_CONDITION_AXIS_KEYS } from "../vocab"

/**
 * Turn-loop slice (R5; ports v1 `reduce/turn.ts` onto the consumption model).
 * `endTurn` ends the current actor's turn: it **increments** their
 * `turnsTakenThisRound` (SUPERSEDE of v1's `hasActedThisRound = true` — a count,
 * not a flag, so it doubles as the boss-multi-turn substrate; the acted-flag is
 * derived `turnsTakenThisRound > 0`), and ticks **only that actor's**
 * battle-condition durations down by one. An axis reaching 0 auto-expires —
 * dropping its duration entry and resetting `battleConditions[axis]` to `neutral`;
 * an axis with no duration entry is left untouched even if non-neutral (R5.2). The
 * actor stays `currentActorId` (clearing is `advanceRound`). A **no-op (same-ref)
 * when there is no current actor or the actor id matches no participant** (R5.3).
 *
 * `endTurn` carries no payload beyond its kind, so this slice takes only the
 * session — the routed kind is the discriminant.
 */
export function reduceTurn(session: Session): Session {
  const actorId = session.currentActorId
  // Stryker disable next-line ConditionalExpression: equivalent — without this
  // early return, `produce` runs, `find(id === null)` misses, the
  // `actor === undefined` guard returns, and Immer yields the original session
  // reference, so the result is identical.
  if (actorId === null) return session

  return produce(session, (draft) => {
    const actor = draft.participants.find((entry) => entry.id === actorId)
    if (actor === undefined) return

    actor.overlay.turnState.turnsTakenThisRound += 1
    for (const axis of BATTLE_CONDITION_AXIS_KEYS) {
      const remaining = actor.overlay.conditionDurations[axis]
      if (remaining === undefined) continue
      if (remaining > 1) {
        actor.overlay.conditionDurations[axis] = remaining - 1
      } else {
        delete actor.overlay.conditionDurations[axis]
        actor.overlay.battleConditions[axis] = "neutral"
      }
    }
  })
}
