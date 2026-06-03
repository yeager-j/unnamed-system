import type { BattleConditionAxisKey, PoolsEdit } from "@/lib/game/character"

import type {
  CombatAdvantage,
  CombatantSetup,
  CombatSession,
  CombatSide,
} from "./session"

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

/** `endTurn` ends the current actor's turn (they are marked as having acted; the
 *  actor is kept as `currentActorId`). */
export type EndTurnEvent = { kind: "endTurn" }

/**
 * `startCombat` opens the encounter: the DM declares the opening `advantage` and
 * which side acts first (`firstSide`). The reducer just records both on the
 * session **verbatim** — it is a no-op once `advantage` is non-null (an encounter
 * cannot start twice). The shell resolves `firstSide` (highest-Agility side,
 * DM-overridable) and transitions the DB `status` `draft → live` *after*
 * persisting the reduced session (UNN-332); the pure reducer never touches status.
 *
 * `firstSide` is only *meaningfully free* under `neutral` advantage; for
 * `players`/`enemies` advantage the advantaged side takes the opening turns, so
 * the shell resolves `firstSide` to that same side. That coupling is the shell's
 * invariant to uphold, not the reducer's — the reducer records whatever pair it
 * is given so it stays a pure, total recorder. `advantage`/`firstSide` are
 * consumed by the `nextDraftingSide` selector (UNN-304).
 */
export type StartCombatEvent = {
  kind: "startCombat"
  advantage: CombatAdvantage
  firstSide: CombatSide
}

/** Turn-loop events. The rest of the turn model (drafting the next actor, round
 *  rollover, Fallen-skip, per-turn effects) is the Turn-Order epic (UNN-285)
 *  extending this sub-union. */
export type TurnEvent = EndTurnEvent | StartCombatEvent

/**
 * Round-lifecycle + mid-round roster events. `advanceRound` rolls the encounter
 * to the next round: it increments `round`, resets every combatant's
 * `hasActedThisRound` to `false`, and clears `currentActorId` — the only event
 * that clears those flags (individual flags are set by `endTurn`). It always
 * applies, even when no one has acted, as an idempotent round-end safeguard.
 * `addCombatant` joins a combatant mid-fight: it enters with
 * `hasActedThisRound = true` so it is not eligible until the next round (its
 * stable id is minted by the reducer's injectable `newId`). `removeCombatant`
 * drops a combatant; if it was the current actor, `currentActorId` is cleared.
 * Auto-advancing when everyone has acted is a UI decision, out of scope here
 * (UNN-306).
 */
export type RoundEvent =
  | { kind: "advanceRound" }
  | { kind: "addCombatant"; setup: CombatantSetup }
  | { kind: "removeCombatant"; combatantId: string }

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
export type CombatEvent = TurnEvent | RoundEvent | BattleConditionEvent

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
