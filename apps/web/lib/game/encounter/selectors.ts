import type { Combatant, CombatSession } from "./session"

/**
 * Pure read-only views over a {@link CombatSession} — derived state the reducer
 * never stores. Selectors that depend on a combatant being Fallen take
 * `fallenIds` as an injected `Set<string>` of combatant ids: the encounter layer
 * can't compute Fallen for a PC on its own (its vitals live on the character row,
 * read via `isFallen`), so the impure shell resolves the set and passes it in.
 * UNN-304 adds `eligibleCombatants` / `nextDraftingSide` here under the same
 * contract.
 */

/**
 * The combatants who still have to act this round: those whose
 * `hasActedThisRound` is `false` and who are not Fallen. Order matches
 * `session.combatants`.
 */
export function pendingCombatants(
  session: CombatSession,
  fallenIds: Set<string>
): Combatant[] {
  return session.combatants.filter(
    (combatant) => !combatant.hasActedThisRound && !fallenIds.has(combatant.id)
  )
}
