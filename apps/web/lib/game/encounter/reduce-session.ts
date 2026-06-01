import { reduceBattleConditionEvent } from "./reduce/conditions"
import { reduceTurnEvent } from "./reduce/turn"
import type { CombatSession } from "./session"
import type { CombatEvent, CombatSessionResult } from "./session-event"

export type { CombatEvent, CombatSessionResult } from "./session-event"

/**
 * The pure tracker reducer: applies a {@link CombatEvent} to an immutable
 * {@link CombatSession}, returning the next session and the character-row edits
 * to emit ({@link CombatSessionResult}). It is a **decider** — deterministic, no
 * I/O, no mutation, and it never applies the edits itself; the caller runs them
 * through the existing combat-state server actions. The character engine's
 * counterpart is {@link reduceCharacter}.
 *
 * Dispatch is a grouped `switch` over `event.kind` routing to per-domain slices
 * in `./reduce/`, mirroring `reduceCharacter`'s `routeEdit`. There is no
 * `default`: the switch is exhaustive over every {@link CombatEvent} kind, so a
 * new kind added to the union without a matching case fails to compile here
 * ("not all code paths return a value") until it is both handled in a slice and
 * routed — the compile-time guarantee that the event vocabulary and its dispatch
 * stay in lockstep. *Illegal* events (well-typed but a no-op against the current
 * state, e.g. `endTurn` with no current actor) are handled inside their slice.
 */
export function reduceCombatSession(
  session: CombatSession,
  event: CombatEvent
): CombatSessionResult {
  switch (event.kind) {
    case "endTurn":
      return reduceTurnEvent(session, event)

    case "applyBattleConditionDuration":
      return reduceBattleConditionEvent(session, event)
  }
}
