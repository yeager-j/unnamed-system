import type { CombatStateEdit } from "@/lib/game/character"

import type { CombatSession } from "./session"

/**
 * The tracker reducer's vocabulary: the events that drive a {@link CombatSession}
 * forward, and the result a transition produces. A type-only leaf module
 * (mirrors the character engine's `character-edit.ts`) so a slice imports the
 * event it handles without importing the orchestrator that imports the slice
 * back.
 *
 * `CombatEvent` is the sum of per-domain sub-unions, exactly like `CharacterEdit`.
 * It is seeded here with the turn sub-union; sibling tickets add their own
 * sub-unions (zones UNN-287, durations UNN-293, Charged/Concentrating UNN-294,
 * turn-order UNN-285, panel UNN-286) and a matching `switch` case — the union
 * and its dispatch grow together.
 */

/** Turn-loop events. `endTurn` ends the current actor's turn; the rest of the
 *  turn model (drafting the next actor, round rollover, Fallen-skip, per-turn
 *  effects) is the Turn-Order epic (UNN-285) extending this sub-union. */
export type TurnEvent = { kind: "endTurn" }

/**
 * One event applied to a {@link CombatSession}. The discriminated union the
 * reducer dispatches over; its `kind`s stay in lockstep with the orchestrator's
 * exhaustive `switch`.
 */
export type CombatEvent = TurnEvent

/**
 * What {@link reduceCombatSession} (and each slice) returns: the next session
 * and the character-row edits to emit. The reducer is a **decider** — it never
 * applies the edits; the caller runs them through the existing combat-state
 * server actions. An unchanged transition returns the same session and `edits: []`.
 */
export interface CombatSessionResult {
  session: CombatSession
  edits: CombatStateEdit[]
}
