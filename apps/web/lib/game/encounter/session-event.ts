import type { BattleConditionAxisKey, PoolsEdit } from "@/lib/game/character"

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
 * rather than stacks (UNN-293 / rulebook 3.8). It owns *how long* only; the
 * axis's increased/decreased *state* lives on the combatant's `battleConditions`
 * overlay (ADR Decision 1), set by a future panel event (UNN-309+). Decrement
 * and expiry happen on `endTurn`, which mutates the overlay back to `neutral`.
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
 * A rare PC-**vitals** nudge the reducer emits, tagged with the combatant it
 * pertains to. Combat state lives on the combatant and is mutated in place (ADR
 * Decision 2), so the reducer no longer emits combat-state edits at all; the one
 * surviving emission is a vitals change to a PC's character row — e.g.
 * end-of-combat Fallen-restore to 1 HP — which the impure shell (UNN-332) applies
 * as a {@link PoolsEdit}. The reducer stays combatant-agnostic: it reports "this
 * PC combatant's vitals should change" and leaves the PC→character mapping to the
 * shell. No transition emits one yet.
 */
export interface EmittedEdit {
  combatantId: string
  edit: PoolsEdit
}

/**
 * What {@link reduceCombatSession} (and each slice) returns: the next session and
 * the PC-vitals edits to emit ({@link EmittedEdit}). The reducer is a **decider**
 * — it never applies the edits; the caller runs them through the existing pools
 * server actions. An unchanged transition returns the same session and `edits: []`.
 */
export interface CombatSessionResult {
  session: CombatSession
  edits: EmittedEdit[]
}
