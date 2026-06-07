import {
  type AttributeScores,
  type Mastery,
} from "@workspace/game/foundation/archetypes/schema"
import { type Lineage } from "@workspace/game/foundation/character/lineage"
import type {
  ManualBonuses,
  PathChoice,
} from "@workspace/game/foundation/character/state"
import {
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"
import { type EquippableItem } from "@workspace/game/foundation/items/schema"
import { type ActiveMechanic } from "@workspace/game/foundation/mechanics/schema"
import { type Skill } from "@workspace/game/foundation/skills/schema"

/**
 * The minimal, persistence-agnostic view of a character the stat engine's pure
 * computations consume. The engine's `buildStatContext` assembly site hydrates
 * this from the `characters` row, its `characterArchetypes`, and the resolved
 * catalog entries of equipped `inventoryItems`. Equipped items and the active
 * Archetype's in-effect Skills arrive already resolved (not as catalog keys) so
 * the computations own no catalog lookup and stay pure and trivially testable;
 * Archetypes are referenced by key because the Archetype catalog is the
 * canonical, test-usable source of their intrinsic data.
 *
 * A logic-free type, so it lives in `foundation` beside the vocabulary it is
 * built from; the functions that assemble and consume it stay in `engine`.
 */
export interface StatContext {
  pathChoice: PathChoice
  /** Character level (1–30). Level 1 is the starting value, no Hit/Skill Dice. */
  level: number
  manualBonuses: ManualBonuses
  /** Slug key of the active Archetype, or null when none is set. */
  activeArchetypeKey: string | null
  /**
   * The active Archetype's Lineage, or null when none is active. Resolved once
   * at the assembly site so the Attack-Roll Lineage scaler reads a plain field
   * instead of looking up the catalog.
   */
  activeLineage: Lineage | null
  /**
   * Every unlocked Archetype with its current Rank **and** its resolved
   * {@link Mastery} descriptor (active or not). The descriptor is the only
   * catalog-coupled value the mastery-bonus computation needs; resolving it at
   * the assembly site keeps that read at the boundary while the Rank-gate and
   * kind→pool mapping stay engine rules.
   */
  archetypes: ReadonlyArray<{ key: string; rank: number; mastery: Mastery }>
  /** The resolved catalog entries of currently-equipped inventory items. */
  equippedItems: readonly EquippableItem[]
  /**
   * The active Archetype's in-effect Skills: its Rank-unlocked Skills plus
   * Skills inherited into its slots. The caller does that Rank/inheritance
   * selection (the same layer that resolves {@link equippedItems}). Only
   * passive Skills' effects are applied; non-passive entries and Skills from
   * inactive Archetypes contribute nothing.
   */
  activeSkills: readonly Skill[]
  /** The active Archetype's unique mechanic + state, or null when absent. */
  activeMechanic: ActiveMechanic | null
  /**
   * The provenance-neutral **base** Attribute scores the bonus pool stacks on
   * top of: a character fills these from its active Archetype's intrinsics (or
   * zeros when none), an enemy from its flat stat block. Resolved once at the
   * assembly site so the attribute computation owns no Archetype lookup and
   * works for any combatant.
   */
  baseAttributes: AttributeScores
  /**
   * The provenance-neutral **base** Affinity chart the equipment / passive /
   * mechanic layers override. A character fills it from its Archetype chart, an
   * enemy from its flat affinities — so the chart resolver, like the attribute
   * computation, no longer reaches into the Archetype catalog.
   */
  baseAffinities: Record<DamageType, Affinity>
}
