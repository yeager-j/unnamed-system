import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  CharacterTalentRow,
  InventoryItemRow,
} from "../db/load-character"
import type { Affinity, DamageType } from "./affinity"
import type { ResolvedAttackRoll } from "./attack-roll"
import type { EquippableItem } from "./items/schema"
import type { ResolvedSkillCost } from "./skill-cost"
import type { Skill } from "./skills/schema"
import type { ActiveMechanic, AttributeScores } from "./stats"

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
 *  alongside (or `null` for cost-free Skills) and its resolved per-Skill
 *  Attack Roll bonus. The catalog's raw `cost` field stays on the Skill; the
 *  engine-derived values live on `resolvedCost` and `attackRollBonus` so the
 *  pair is distinguishable when both happen to be in scope. `attackRollBonus`
 *  is `{ total: 0, sources: [] }` on Skills that make no Attack Roll. */
export type HydratedSkill = Skill & {
  resolvedCost: ResolvedSkillCost | null
  /** Pre-resolved Attack Roll readout — null on Skill kinds that make no
   *  Attack Roll (passive / heal / support) or on attack Skills that ship
   *  with no `attackRoll` table (severe flat-damage Skills). */
  resolvedAttackRoll: ResolvedAttackRoll | null
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
   * Per-Skill Attack Roll readouts live on each {@link HydratedSkill}; this
   * field carries the resolved readout for the equipped weapon's intrinsic
   * attack (mechanically identical to a Skill's Attack Roll). Null when no
   * weapon is equipped. Pre-resolved here so the read-only sheet does not
   * need to re-derive it client-side.
   */
  weaponAttackRoll: ResolvedAttackRoll | null
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
