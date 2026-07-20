import type { CombatWriteDispatchError } from "@/domain/combat/replica/rejection"

import type { AddCatalogEnemiesError } from "./add-participants.schema"
import type { ApplyCombatEventError } from "./apply-event.schema"
import type { EndCombatError } from "./end-combat.schema"

/**
 * Maps a v2 combat Server-Action error to its user-facing toast copy — the one
 * home for every `lib/actions/combat/*` surface (the setup shell, the live
 * console, the drawer's write router), so phrasing can't drift between them.
 * v1's wording carries over for the codes that survived the cutover; the new
 * codes are the v2 loader's data-integrity arms and the write-router's
 * refusals — all programmer-bug tier (the affordance shouldn't have rendered),
 * surfaced with honest generic copy rather than swallowed.
 */
export function combatErrorMessage(
  error:
    | ApplyCombatEventError
    | CombatWriteDispatchError
    | EndCombatError
    | AddCatalogEnemiesError
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
    case "encounter-not-live":
      return "This encounter is no longer live. Reload and try again."
    case "encounter-ended":
      return "This encounter has ended. Reload and try again."
    case "map-instance-not-found":
      return "This encounter's map is missing. Reload and try again."
    case "map-instance-frozen":
      return "This encounter's map is closed to further changes. Reload and try again."
    case "invalid-state":
      return "Something looks off with this encounter's map. Reload and try again."
    case "character-not-found":
      return "That character no longer exists."
    case "unknown-enemy":
      return "One of the queued enemies isn't in the catalog anymore."
    case "participant-not-found":
      return "That combatant is no longer in this encounter."
    case "turn-frame-changed":
      return "The active turn changed before that action could apply."
    case "draft-no-longer-valid":
      return "That combatant can no longer take this turn."
    case "round-no-longer-complete":
      return "This round is no longer complete."
    case "invalid-delta":
      return "That adjustment is no longer valid."
    case "invalid-input":
      return "Something looks off with the roster. Try again."
    // Data-integrity + programmer-bug tier: the write reached a state the UI
    // should have made impossible. Honest generic copy, never silent.
    case "invalid-session":
    case "participant-load-failed":
    case "invalid-entity":
    case "locator-missing":
    case "participant-not-inline":
    case "forbidden":
    case "invalid-write":
    case "entity-not-found":
    case "entity-load-failed":
      return "Something went wrong with this encounter's data. Reload and try again."
    // The quiet arm: a disposed/expired replica already surfaced its own
    // toast (or the surface is unmounting); callers never toast this code,
    // but the union is exhaustive here by design.
    case "write-unavailable":
      return "Reconnecting — try that again in a moment."
    // The Writer refusals; the character-family ones (allocation cap, entry
    // index, rest/leveling, the Spark loop — UNN-556/UNN-557/UNN-558) are
    // unreachable through the narrowed encounter wire, but the shared refusal
    // union carries them.
    case "capability-missing":
    case "no-prisma-charges":
    case "no-transitions":
    case "allocation-cap-exceeded":
    case "entry-not-found":
    case "not-unlocked":
    case "insufficient-skill-dice":
    case "insufficient-hit-dice":
    case "insufficient-victories":
    case "max-level":
    case "log-full":
    case "log-not-full":
    case "virtue-not-eligible":
    case "rank-capped":
    case "no-saved-ranks":
    case "prerequisites-not-met":
    case "item-not-found":
    case "catalog-item-unknown":
    case "invalid-quantity":
    case "duplicate-item-id":
      return "That change can't apply to this combatant. Reload and try again."
  }
}
