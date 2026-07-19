import type { EncounterWriteRefusal } from "./mutations"

/**
 * The combat authority's terminal rejection vocabulary (UNN-646), the sibling
 * of `domain/entity/replica/rejection.ts` — same rules: a rejection is
 * recorded against the client's watermark as the mutation's trusted terminal
 * outcome, so everything here must be serializable and stable across deploys,
 * and `"forbidden"` is a typed rejection, never a `forbidden()` throw.
 *
 * `EncounterWriteRefusal` covers both roots' apply refusals: Writer refusals
 * on trusted state, the roster miss, plus the two preconditions the
 * storage-native encounter root decides inside its registered apply
 * (UNN-655) — `"participant-not-inline"` (the home is the stored locator's
 * fact, so a wrong client belief fails closed instead of mis-routing) and
 * `"encounter-not-live"` (combat writes are only licensed while the
 * encounter is running: a stale tab, a lost race against End Combat, or a
 * cross-tab straggler must refuse rather than mutate an encounter whose end
 * sweep has already been committed; it shares the classic doors' code,
 * `endCombatAction` — one vocabulary for one rule). Both are enforced by the
 * doors under the encounter row lock. The remaining door codes:
 * `"encounter-not-found"` / `"invalid-session"` are the encounter loader's
 * data-integrity codes surfaced verbatim; `"entity-not-found"` /
 * `"entity-load-failed"` mirror the durable door; `"invalid-write"` is the
 * client-facing collapse of recorded decode refusals (deploy skew).
 * (`"locator-missing"` retired with the shell root — the storage-native
 * serialize is total, so the fail-closed serializer arm no longer exists.)
 */
export type CombatReplicaRejection =
  | EncounterWriteRefusal
  | "forbidden"
  | "encounter-not-found"
  | "invalid-session"
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
