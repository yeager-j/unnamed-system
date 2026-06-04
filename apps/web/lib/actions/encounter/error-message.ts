import type { ApplyCombatEventError } from "./events.schema"
import type { SaveEncounterSetupError } from "./setup.schema"

/**
 * Maps an encounter Server Action error to its user-facing toast copy. Shared by
 * every encounter write surface (the setup shell UNN-335 and the live console
 * UNN-344) so the phrasing can't drift between them. Both error unions are
 * covered by the same four cases — `EncounterWriteError`'s `stale` /
 * `encounter-not-found`, plus `invalid-input` and the single-live guard.
 */
export function encounterErrorMessage(
  error: ApplyCombatEventError | SaveEncounterSetupError
): string {
  switch (error) {
    case "campaign-already-has-live-encounter":
      return "This campaign already has a live encounter."
    case "stale":
      return "This encounter changed elsewhere. Reload and try again."
    case "encounter-not-found":
      return "This encounter no longer exists."
    case "invalid-input":
      return "Something looks off with the roster. Try again."
  }
}
