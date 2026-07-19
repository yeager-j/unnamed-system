import type { CombatWriteRefusal } from "./mutations"

/**
 * The combat authority's terminal rejection vocabulary (UNN-646), the sibling
 * of `domain/entity/replica/rejection.ts` — same rules: a rejection is
 * recorded against the client's watermark as the mutation's trusted terminal
 * outcome, so everything here must be serializable and stable across deploys,
 * and `"forbidden"` is a typed rejection, never a `forbidden()` throw.
 *
 * `CombatWriteRefusal` covers both roots' apply refusals (Writer refusals on
 * trusted state, plus the inline roster miss). The door codes:
 * `"participant-not-inline"` is the session door refusing a write addressed
 * to a durable participant — the home is derived server-side from the locator
 * map, so a wrong client belief fails closed instead of mis-routing;
 * `"encounter-not-found"` / `"invalid-session"` are the encounter loader's
 * data-integrity codes surfaced verbatim; `"locator-missing"` is the
 * fail-closed session serializer refusing; `"entity-not-found"` /
 * `"entity-load-failed"` mirror the durable door; `"invalid-write"` is the
 * client-facing collapse of recorded decode refusals (deploy skew).
 *
 * `"encounter-not-live"` is the liveness precondition, checked by BOTH push
 * doors under the encounter row lock (UNN-646 review). Combat writes are only
 * licensed while the encounter is running: a stale tab, a lost race against
 * End Combat, or a cross-tab straggler must refuse rather than mutate an
 * encounter whose end sweep has already been committed. It shares the classic
 * doors' code (`endCombatAction`) deliberately — one vocabulary for one rule.
 */
export type CombatReplicaRejection =
  | CombatWriteRefusal
  | "forbidden"
  | "participant-not-inline"
  | "encounter-not-found"
  | "encounter-not-live"
  | "invalid-session"
  | "locator-missing"
  | "entity-not-found"
  | "entity-load-failed"
  | "invalid-write"

/**
 * The dispatch's caller-visible failure vocabulary (`useCombatantWrite`):
 * the rejection taxonomy above, plus the one quiet arm — `write-unavailable`
 * covers a replica that is disposed (unmounting), expired (rebuilding, and
 * the expiry toast already fired), or terminally unavailable (its bootstrap
 * gave up — the encounter ended, or the participant left the roster). None is
 * toasted: each has already produced its own user-visible consequence, and
 * the alternative to settling them is a transition that never resolves.
 */
export type CombatWriteDispatchError =
  | CombatReplicaRejection
  | "write-unavailable"
