import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  CharacterTalentRow,
  InventoryItemRow,
} from "../db/load-character"
import type { Affinity, DamageType } from "./affinity"
import type { EquippableItem } from "./items/schema"
import type { ResolvedSkillCost } from "./skill-cost"
import type { Skill } from "./skills/schema"
import type { ActiveMechanic, AttackRollBonus, AttributeScores } from "./stats"

/**
 * The complete sheet view consumed by every character-sheet surface: every
 * persisted column plus the engine-derived values. Lives in `lib/game/` so
 * game-layer code (mechanic transforms, mutation engines) can operate on a
 * hydrated character without crossing into the persistence layer; only the
 * thin assembler in [lib/db/load-character.ts](../db/load-character.ts)
 * constructs values of these shapes.
 *
 * The DB row shapes are still defined alongside the schema (`lib/db/`) since
 * they're inferred from Drizzle tables — they're type-imported here.
 */

/** An inventory row spread flat, with the resolved catalog entry alongside
 *  (or `undefined` when the persisted `catalogItemKey` no longer exists in
 *  the shipped data). */
export type HydratedInventoryItem = InventoryItemRow & {
  item: EquippableItem | undefined
}

/** A character's active Skill spread flat, with its concrete payable cost
 *  alongside (or `null` for cost-free Skills). The catalog's raw `cost`
 *  field stays on the Skill; the engine-derived value lives on
 *  `resolvedCost` so the two are distinguishable when both happen to be in
 *  scope. */
export type HydratedSkill = Skill & {
  resolvedCost: ResolvedSkillCost | null
}

/**
 * The complete sheet view: every persisted `characters` column (spread flat),
 * the character's child rows, and the engine-derived values every PRD §6
 * section needs — each datum present exactly once. The pure
 * `StatComputationCharacter` is intentionally *not* embedded: it re-bundles
 * `level` / `pathChoice` / `manualBonuses`, so storing it here would
 * duplicate them. Engine callers reconstruct it on demand via
 * `buildStatComputationCharacter` in [lib/game/stat-character.ts](./stat-character.ts).
 */
export type HydratedCharacter = CharacterRow & {
  archetypeRows: CharacterArchetypeRow[]
  knives: CharacterKnifeRow[]
  chains: CharacterChainRow[]
  talents: CharacterTalentRow[]
  /** Full inventory (equipped and not); only equipped items apply effects. */
  inventory: HydratedInventoryItem[]
  /** Resolved slug of the active Archetype, or `null` when none is set. */
  activeArchetypeKey: string | null
  attributes: AttributeScores
  maxHP: number
  maxSP: number
  maxHitDice: number
  maxSkillDice: number
  affinityChart: Record<DamageType, Affinity>
  /**
   * Total cross-Skill Attack Roll bonus from the active Archetype's unique
   * mechanic (e.g. Warrior's Perfection rank). Surfaced here so every Skill
   * card reads a single resolved number with attribution rather than
   * re-deriving it; future Effect kinds (damage modifiers etc.) follow the
   * same shape.
   */
  attackRollBonus: AttackRollBonus
  /**
   * The active Archetype's unique mechanic + its persisted state, with the
   * mechanic's `initialState` filled in when the row is null. Null when no
   * Archetype is active or the active Archetype has no declared mechanic.
   * The Combat-tab widget reads this directly.
   */
  activeMechanic: ActiveMechanic | null
  /** The active Archetype's in-effect Skills with concrete resolved costs. */
  skills: HydratedSkill[]
}
