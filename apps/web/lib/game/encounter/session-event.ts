import type {
  BattleConditionAxisKey,
  CombatStateEdit,
} from "@/lib/game/character"

import type { CombatSession } from "./session"

/**
 * The tracker reducer's vocabulary: the events that drive a {@link CombatSession}
 * forward, and the result a transition produces. A type-only leaf module
 * (mirrors the character engine's `character-edit.ts`) so a slice imports the
 * event it handles without importing the orchestrator that imports the slice
 * back.
 *
 * `CombatEvent` is the sum of per-domain sub-unions, exactly like `CharacterEdit`.
 * Sibling tickets add their own sub-unions (zones UNN-287, Charged/Concentrating
 * UNN-294, turn-order UNN-285, panel UNN-286) and a matching `switch` case — the
 * union and its dispatch grow together.
 */

/** Turn-loop events. `endTurn` ends the current actor's turn; the rest of the
 *  turn model (drafting the next actor, round rollover, Fallen-skip, per-turn
 *  effects) is the Turn-Order epic (UNN-285) extending this sub-union. */
export type TurnEvent = { kind: "endTurn" }

/**
 * Battle-condition duration events. `applyBattleConditionDuration` sets or
 * extends a combatant's remaining turns on an axis — re-application **extends**
 * rather than stacks (UNN-293 / rulebook 3.8). Session-only: the character's
 * increased/decreased *state* is set through the existing combat-state action
 * (the session owns *how long*, the character owns *what*). Decrement and expiry
 * happen on `endTurn`.
 */
export type BattleConditionEvent = {
  kind: "applyBattleConditionDuration"
  combatantId: string
  axis: BattleConditionAxisKey
  turns: number
}

/**
 * One event applied to a {@link CombatSession}. The discriminated union the
 * reducer dispatches over; its `kind`s stay in lockstep with the orchestrator's
 * exhaustive `switch`.
 */
export type CombatEvent = TurnEvent | BattleConditionEvent

/**
 * A character-row edit the reducer emits, tagged with the combatant it pertains
 * to. The reducer is **combatant-agnostic**: it reports "this combatant's axis
 * went neutral" and leaves the PC→character mapping (and any enemy-state
 * handling) to the consumer that applies edits through the combat-state actions.
 */
export interface EmittedEdit {
  combatantId: string
  edit: CombatStateEdit
}

/**
 * What {@link reduceCombatSession} (and each slice) returns: the next session and
 * the edits to emit ({@link EmittedEdit}). The reducer is a **decider** — it
 * never applies the edits; the caller runs them through the existing combat-state
 * server actions. An unchanged transition returns the same session and `edits: []`.
 */
export interface CombatSessionResult {
  session: CombatSession
  edits: EmittedEdit[]
}
