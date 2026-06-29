import type {
  ParticipantView,
  ParticipantViewComponents,
} from "@workspace/game-v2/encounter/participant-view"

import { relationship, type Viewer } from "./relationship"
import { VISIBILITY, type ProjectableKey } from "./visibility-table"

/**
 * Redacts one participant's **merged participant-view** for a viewer (CD11; ADR §2.6) and
 * returns the surviving components: compute the {@link relationship} once, then
 * keep only the components whose {@link VISIBILITY} cell is `public`. A `drop` cell
 * means the key is **never written** — structural absence, the v1 RED-4 security
 * contract — so an opponent's `attributes`/`affinities` cannot leak. Folds over the
 * **resolved** entity (resolved read-units only — never authored
 * `damage`/`spSpent`); a key with no policy cell drops too (defence in depth).
 *
 * Returns the redacted **components only** — never an id. The relationship reads
 * `entity.id` (the **entity** id) for ownership, but a visible
 * combatant's identity is a **roster** concern: the snapshot projector pairs these
 * components with the `participant.id` (see {@link
 * import("./snapshot").VisibleCombatant}). Keeping the id out of here means the
 * entity-id-vs-roster-id distinction is decided exactly once, by the projector.
 */
export function visibleEntity(
  entity: ParticipantView,
  viewer: Viewer
): Partial<ParticipantViewComponents> {
  const rel = relationship(entity, viewer)

  // `Object.entries` widens keys to `string` and decorrelates each value from its
  // own key; `VISIBILITY[key]?.[rel]` re-narrows safely (an unpoliced key ⇒
  // `undefined` ⇒ dropped). The single `as Partial<ParticipantViewComponents>` reattaches
  // the per-key value types `fromEntries` cannot track — the runtime only ever
  // copies a key's own value, so the assertion hides no mismatch (TS's correlated-
  // key limitation, not a correctness paper-over).
  return Object.fromEntries(
    Object.entries(entity.components).filter(
      ([key]) => VISIBILITY[key as ProjectableKey]?.[rel] === "public"
    )
  ) as Partial<ParticipantViewComponents>
}
