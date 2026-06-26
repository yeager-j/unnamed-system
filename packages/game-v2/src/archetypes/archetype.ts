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

/**
 * The Archetype tiers, in canonical order (the Atlas's fixed column order). Only
 * `initiate` ships at MVP; the full set is kept because tiers are a fixed,
 * documented game concept the Atlas renders as four columns per Lineage.
 */
export const ARCHETYPE_TIERS = [
  "initiate",
  "adept",
  "elite",
  "paragon",
] as const

export type ArchetypeTier = (typeof ARCHETYPE_TIERS)[number]

/**
 * A reference to one of an Archetype's Rank-keyed Skills (or its Synthesis Skill)
 * — the catalog Skill `skill` unlocked at Archetype Rank `rank`. `skill` is a bare
 * catalog key (validated at load, not narrowed to a registry type — the v2 interim
 * convention).
 */
export interface SkillReference {
  skill: string
  rank: number
}

/**
 * A requirement that another Archetype be at a given Rank before this Archetype
 * unlocks, e.g. `{ archetype: "knight", rank: 5 }`. The referenced Archetype need
 * not ship at MVP — prerequisites are display/gating-only and resolve loosely.
 */
export interface ArchetypePrerequisite {
  archetype: string
  rank: number
}

/**
 * The **full catalog Archetype** — the {@link ArchetypeBase} derivation slice
 * widened with the authored metadata the Atlas, archetype display, inheritance,
 * and recommendations read (the archetypes domain PR, UNN-504). `resolve` still
 * reads only the base slice, so widening `getArchetype`'s return to `Archetype`
 * leaves the fold untouched (structural widening).
 *
 * Authored catalog content (not a persisted component), so — like
 * {@link ArchetypeBase} — it carries no Zod load schema; the catalog validates its
 * own content (referential integrity at load, `satisfies Archetype` at compile).
 */
export interface Archetype extends ArchetypeBase {
  key: string
  name: string
  tier: ArchetypeTier
  prerequisites: ArchetypePrerequisite[]
  /** How many Inheritance Slots this Archetype grants when active. */
  inheritanceSlots: number
  talents: string[]
  /** Rank-keyed Skills (Synthesis lives on {@link synthesisSkill}, never here). */
  skills: SkillReference[]
  /** The Archetype's Rank-5 Synthesis Skill, if it declares one (never inheritable). */
  synthesisSkill?: SkillReference
}
