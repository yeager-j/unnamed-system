import type { Allegiance } from "@workspace/game-v2/encounter/overlay"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

/**
 * The **viewer ↔ entity relationship** that drives redaction (CD11; ADR §2.6).
 * Computed **once** per (entity, viewer) by {@link relationship}, then fed to the
 * single `(component × relationship)` policy table in {@link
 * import("./visibility-table").VISIBILITY} — so no redaction site ever re-derives
 * "who is looking at whom".
 *
 * - `own` — the viewer controls this entity (ownership **capability**, never
 *   `kind === "pc"`): a charmed PC reads `own` to its controller and `opponent`
 *   to its old party.
 * - `ally` / `opponent` — same / opposing combat side.
 * - `spectator` — a sideless viewer (a signed-out watcher), or the least-privilege
 *   fail-safe when an entity carries no allegiance.
 * - `dm` — the encounter's DM, who short-circuits to full visibility.
 */
export type Relationship = "own" | "ally" | "opponent" | "spectator" | "dm"

/**
 * Who is looking. Built by the impure app layer from the signed-in session:
 * - a signed-out watcher ⇒ `{ isDm: false, side: null, ownedEntityIds: ∅ }`
 *   (spectator to everyone),
 * - a player ⇒ their combat `side` + the entity ids they control,
 * - the DM ⇒ `{ isDm: true, … }`.
 *
 * `ownedEntityIds` is keyed on the **entity** id (`entity.id` — the ownership
 * capability), so control is decoupled from which **side** an entity fights for
 * and from a participant's **roster** id (the snapshot output key). A viewer owns
 * characters/entities, not roster slots.
 *
 * **TRUST BOUNDARY (security-critical).** Every `Viewer` field MUST be
 * **server-derived** from the authenticated session — `isDm` from the encounter's
 * DM, `side` + `ownedEntityIds` from the signed-in user's campaign membership and
 * owned characters. It must **never** be taken from client input: a watcher who
 * could self-assign `side: "enemies"` would read the enemy team's stats as an
 * `ally`. The integration that constructs this (UNN-520) owns enforcing it.
 */
export interface Viewer {
  isDm: boolean
  side: CombatSide | null
  ownedEntityIds: ReadonlySet<string>
}

/**
 * The minimal entity surface {@link relationship} reads: its `id` (for ownership)
 * and its (merged-view) `allegiance` (for ally/opponent). A full {@link
 * import("@workspace/game-v2/encounter/participant-view").ParticipantView} satisfies it, and a
 * test can pass a bare `{ id, components: { allegiance } }`.
 */
export interface RelationshipSubject {
  id: string
  components: { allegiance?: Allegiance }
}

/**
 * Resolves the {@link Relationship} of `entity` to `viewer`, **once**, in a fixed
 * precedence (ADR §2.6): `dm` short-circuit → `own` (ownership capability) →
 * `spectator` (sideless viewer) → no-allegiance fail-safe `spectator` (an entity
 * with no side is least-privilege) → `ally` (same side) → `opponent`.
 */
export function relationship(
  entity: RelationshipSubject,
  viewer: Viewer
): Relationship {
  if (viewer.isDm) return "dm"
  if (viewer.ownedEntityIds.has(entity.id)) return "own"
  if (viewer.side === null) return "spectator"

  const entitySide = entity.components.allegiance?.side
  if (entitySide === undefined) return "spectator"

  return entitySide === viewer.side ? "ally" : "opponent"
}
