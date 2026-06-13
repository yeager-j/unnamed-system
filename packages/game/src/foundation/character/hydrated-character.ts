import { type AttributeScores } from "@workspace/game/foundation/archetypes/schema"
import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  InventoryItemRow,
} from "@workspace/game/foundation/character/records"
import { type TalentKey } from "@workspace/game/foundation/character/talents/schema"
import {
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"
import { type ResolvedAttackRoll } from "@workspace/game/foundation/combat/attack"
import { type DamageBonus } from "@workspace/game/foundation/combat/effects"
import { type Item } from "@workspace/game/foundation/items/schema"
import { type ActiveMechanic } from "@workspace/game/foundation/mechanics/schema"
import {
  type ResolvedSkillCost,
  type Skill,
  type SkillCost,
} from "@workspace/game/foundation/skills/schema"

/**
 * The complete sheet view consumed by every character-sheet surface: every
 * persisted column (spread flat) plus the engine-derived values.
 *
 * **Why this lives in `foundation/`** — the layer split is *types-vs-functions*
 * (`foundation` owns types/vocabulary, `engine` owns the pure functions), and
 * this is a logic-free type. Concretely it is `CharacterRow & { …derived }`, an
 * extension of the persisted-row contract in
 * {@link import("@workspace/game/foundation/character/records") records.ts} (the
 * leaf-package boundary that severed the `game → db` cycle), so it must sit with
 * its base rather than fracture one conceptual type across two layers. It is also
 * the lingua franca every layer imports: the thin assembler in
 * `apps/web/lib/db/queries/load-character.ts` is the only place that *constructs*
 * these shapes — the engine and every sheet surface only *consume* them.
 *
 * The persisted-row types are **owned here** in `records.ts`; the Drizzle tables
 * in `apps/web/lib/db/schema` import them and a `conformance.test.ts` proves the
 * table matches, so the contract and the table can't drift.
 *
 * The four derived-value types referenced below (`AttributeScores`,
 * `ActiveMechanic`, `ResolvedAttackRoll`, `ResolvedSkillCost`) live in
 * `foundation` beside the vocabulary they extend — their *computation* stays in
 * `engine` — so this module, and `foundation` as a whole, has no upward edge
 * into `engine` (UNN-359).
 */

/** An inventory row spread flat, with the resolved catalog entry alongside
 *  (or `undefined` when the persisted `catalogItemKey` no longer exists in
 *  the shipped data). */
export type HydratedInventoryItem = InventoryItemRow & {
  item: Item | undefined
}

/**
 * A character's active Skill spread flat, with its concrete payable cost
 * alongside (or `null` for cost-free Skills), its resolved per-Skill Attack
 * Roll bonus, and any resolved damage-bonus lines (e.g. a Berserker's Frenzy
 * "+Nd4 Physical"). The catalog's raw `cost` field stays on the Skill; the
 * engine-derived values live on `resolvedCost` / `resolvedAttackRoll` /
 * `resolvedDamageBonuses` so they are distinguishable when in scope.
 * `resolvedAttackRoll` is `null` on Skills that make no Attack Roll;
 * `resolvedDamageBonuses` is `[]` when nothing applies.
 *
 * Distributed over the {@link Skill} discriminated union (UNN-231): the
 * cost-bearing variants (attack / ailment / heal / support) carry a
 * non-null `resolvedCost`, and the passive variant carries `null`. Any
 * narrowing TypeScript can do on the original Skill discriminant —
 * `skill.kind !== "passive"` or `"cost" in skill` — also narrows
 * `resolvedCost` automatically, so consumers no longer need to null-check
 * after they've already established the Skill is cost-bearing.
 */
type HydrateSkill<S> = S extends { cost: SkillCost }
  ? S & {
      resolvedCost: ResolvedSkillCost
      resolvedAttackRoll: ResolvedAttackRoll | null
      resolvedDamageBonuses: DamageBonus[]
    }
  : S & {
      resolvedCost: null
      resolvedAttackRoll: ResolvedAttackRoll | null
      resolvedDamageBonuses: DamageBonus[]
    }

export type HydratedSkill = HydrateSkill<Skill>

/** A {@link HydratedSkill} narrowed to the cost-bearing variants — the
 *  shape any code that requires a concrete `resolvedCost` should accept. */
export type HydratedCostSkill = Extract<HydratedSkill, { cost: SkillCost }>

/**
 * The complete sheet view: every persisted `characters` column (spread flat),
 * the character's child rows, and the engine-derived values every PRD §6
 * section needs — each datum present exactly once. The pure
 * `StatContext` is intentionally *not* embedded: it re-bundles
 * `level` / `pathChoice` / `manualBonuses`, so storing it here would
 * duplicate them. Engine callers reconstruct it on demand via
 * `buildStatContext` in [lib/game/stat-character.ts](./stat-character.ts).
 */
export type HydratedCharacter = CharacterRow & {
  archetypeRows: CharacterArchetypeRow[]
  knives: CharacterKnifeRow[]
  chains: CharacterChainRow[]
  /**
   * The character's full Talent roster — the deduplicated, alphabetized union
   * of the persisted `gainedTalents` (Background + downtime) and the active
   * Archetype's Talents (resolved via `resolveTalents`).
   */
  talents: TalentKey[]
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
   * Resolved damage bonuses (e.g. a Berserker's Frenzy "+Nd4") that apply to
   * the equipped weapon's intrinsic attack — the weapon-attack peer of a
   * {@link HydratedSkill}'s `resolvedDamageBonuses`. Empty when no weapon is
   * equipped or nothing applies.
   */
  weaponDamageBonuses: DamageBonus[]
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
