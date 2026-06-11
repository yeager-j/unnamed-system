import type { ApplyCombatEventError } from "./events.schema"
import type { AddSetupCombatantsError } from "./setup.schema"

/**
 * Maps an encounter Server Action error to its user-facing toast copy. Shared by
 * every encounter write surface (the setup shell UNN-335/347 and the live console
 * UNN-344) so the phrasing can't drift between them. The two error unions overlap
 * on `EncounterWriteError`'s `stale` / `encounter-not-found` plus `invalid-input`;
 * `applyCombatEvent` adds the two `startCombat` guards (single-live + unplaced).
 */
export function encounterErrorMessage(
  error: ApplyCombatEventError | AddSetupCombatantsError
): string {
  switch (error) {
    case "campaign-already-has-live-encounter":
      return "This campaign already has a live encounter."
    case "encounter-has-unplaced-combatants":
      return "Place every combatant in a zone before starting combat."
    case "stale":
      return "This encounter changed elsewhere. Reload and try again."
    case "encounter-not-found":
      return "This encounter no longer exists."
    case "invalid-input":
      return "Something looks off with the roster. Try again."
  }
}
