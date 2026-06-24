import type {
  AttributeKey,
  AttributeScores,
  Lineage,
  MechanicKind,
  PartialAffinityChart,
} from "@workspace/game-v2/kernel/vocab"

/**
 * An Archetype's **Mastery** bonus (re-declared in v2, D32) — the permanent
 * bonus an Archetype confers once its rank reaches {@link MASTERY_RANK}.
 * Value-provenance discrimination on `kind`: a flat HP/SP boost, or an Attribute
 * boost naming its target.
 */
export type Mastery =
  | { kind: "hp"; amount: number }
  | { kind: "sp"; amount: number }
  | { kind: "attribute"; amount: number; attribute: AttributeKey }

/**
 * The **base-stat slice** of a catalog Archetype that derivation reads — the
 * authored intrinsic data `resolve` looks up by key through the `getArchetype`
 * port. PR2 (UNN-500) needs exactly this slice; the archetypes domain PR widens
 * the catalog Archetype (skills, prerequisites, display, the Atlas) around it.
 *
 * Authored catalog content (not a persisted component), so it carries no Zod
 * load schema — the catalog validates its own content.
 */
export interface ArchetypeBase {
  attributes: AttributeScores
  affinities: PartialAffinityChart
  mastery: Mastery
  lineage: Lineage
  /**
   * The unique mechanic this Archetype owns, if any (D36) — the key `resolve`
   * maps an active Archetype to before reading the entity's `Mechanics.states`.
   * `MechanicKind` is neutral kernel vocab (not the `mechanics/` sibling), so this
   * widening introduces no `archetypes ↔ mechanics` cycle. Optional: an Archetype
   * may carry no mechanic.
   */
  mechanic?: MechanicKind
}

/**
 * The rank at which an Archetype's {@link Mastery} bonus applies — automatic, no
 * player choice (rulebook). Applies whether or not the Archetype is active (C4).
 */
export const MASTERY_RANK = 5

/** Whether an Archetype at `rank` confers its Mastery bonus (rank ≥ {@link MASTERY_RANK}). */
export function hasMasteryBonus(rank: number): boolean {
  return rank >= MASTERY_RANK
}
