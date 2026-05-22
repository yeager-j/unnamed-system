import { DAMAGE_TYPES, type Affinity, type DamageType } from "./affinity"
import { getArchetype } from "./archetypes"
import {
  ATTRIBUTE_KEYS,
  hasMasteryBonus,
  resolveAffinity,
  type AttributeKey,
} from "./archetypes/schema"
import type { ManualBonuses, PathChoice } from "./character"
import {
  BONUS_TARGET_KEYS,
  type AffinityEffect,
  type AttackRollEffect,
  type AttributeEffect,
  type BonusTargetKey,
} from "./effects"
import type { EquippableItem } from "./items/schema"
import {
  mechanicEffectsFor,
  type MechanicEffect,
  type MechanicKind,
  type MechanicState,
} from "./mechanics"
import type { Skill } from "./skills/schema"

/**
 * The core derived-value module. Attribute scores, max HP/SP, and the Affinity
 * chart are never persisted — every surface derives them here so they cannot
 * drift. All functions are pure: no I/O, no React, deterministic, and they
 * never mutate their input.
 */

/**
 * The active Archetype's unique mechanic, paired with its persisted state.
 * Null when the active Archetype has no declared mechanic. Mechanics from
 * inactive Archetypes contribute nothing to derived values — their state is
 * still persisted per row but only the active one drives the engine.
 */
export interface ActiveMechanic {
  kind: MechanicKind
  state: MechanicState
}

/**
 * The minimal, persistence-agnostic view of a character these computations
 * need. Callers hydrate this from the `characters` row, its
 * `characterArchetypes`, and the resolved catalog entries of equipped
 * `inventoryItems`. Equipped items and the active Archetype's in-effect Skills
 * arrive already resolved (not as catalog keys) so these functions own no
 * catalog lookup and stay pure and trivially testable; Archetypes are
 * referenced by key because the Archetype catalog is the canonical,
 * test-usable source of their intrinsic data.
 */
export interface StatComputationCharacter {
  pathChoice: PathChoice
  /** Character level (1–30). Level 1 is the starting value, no Hit/Skill Dice. */
  level: number
  manualBonuses: ManualBonuses
  /** Slug key of the active Archetype, or null when none is set. */
  activeArchetypeKey: string | null
  /** Every unlocked Archetype with its current Rank (active or not). */
  archetypes: ReadonlyArray<{ key: string; rank: number }>
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
}

export type AttributeScores = Record<AttributeKey, number>

const ATTRIBUTE_MIN = -7
const ATTRIBUTE_MAX = 7

/**
 * Starting HP/SP and per-level gains by path. The per-level HP figure is the
 * Hit Die average rounded up D&D-style (d12→7, d10→6, d8→5); per-level SP is
 * two Skill Dice averaged, which is already whole (9 / 11 / 13). Source:
 * rulebook `1.1 HP and SP`. Encoded as the published per-path totals rather
 * than re-derived from die size.
 */
const PATH_STATS: Record<
  PathChoice,
  { startHP: number; startSP: number; hpPerLevel: number; spPerLevel: number }
> = {
  "health-focused": { startHP: 24, startSP: 40, hpPerLevel: 7, spPerLevel: 9 },
  balanced: { startHP: 20, startSP: 50, hpPerLevel: 6, spPerLevel: 11 },
  "skill-focused": { startHP: 16, startSP: 60, hpPerLevel: 5, spPerLevel: 13 },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type BonusPool = Record<BonusTargetKey, number>

/**
 * Flattens the structured effects of the active Archetype's passive Skills.
 * Non-passive Skills carry no structured effects (schema-enforced) and are
 * skipped.
 */
function activePassiveEffects(
  character: StatComputationCharacter
): Array<AffinityEffect | AttributeEffect | AttackRollEffect> {
  const effects: Array<AffinityEffect | AttributeEffect | AttackRollEffect> = []
  for (const skill of character.activeSkills) {
    if (skill.kind !== "passive") continue
    for (const effect of skill.effects ?? []) effects.push(effect)
  }
  return effects
}

/**
 * Effects emitted by the active Archetype's unique mechanic given its current
 * persisted state. Returns an empty array when no mechanic is active or when
 * the mechanic has no `effects` method (e.g. display-only mechanics like
 * Path of Dawn and Stains in MVP).
 */
function activeMechanicEffects(
  character: StatComputationCharacter
): MechanicEffect[] {
  const active = character.activeMechanic
  if (!active) return []
  return mechanicEffectsFor(active.kind, active.state, { stats: character })
}

/**
 * Sums every permanent, source-agnostic bonus: derived Mastery (any Archetype
 * at or above its Mastery Rank, active or not), equipped-item Attribute
 * effects, the active Archetype's passive-Skill Attribute effects, and the
 * manually-entered bonuses. Mastery is intentionally derived from Rank here,
 * never read from storage, so an inactive Mastered Archetype still contributes.
 */
function accumulatedBonuses(character: StatComputationCharacter): BonusPool {
  const pool: BonusPool = {
    hp: 0,
    sp: 0,
    strength: 0,
    magic: 0,
    agility: 0,
    luck: 0,
  }

  for (const { key, rank } of character.archetypes) {
    if (!hasMasteryBonus(rank)) continue
    const archetype = getArchetype(key)
    if (!archetype) continue

    const { mastery } = archetype
    if (mastery.kind === "hp") pool.hp += mastery.amount
    else if (mastery.kind === "sp") pool.sp += mastery.amount
    else pool[mastery.attribute] += mastery.amount
  }

  for (const item of character.equippedItems) {
    for (const effect of item.effects ?? []) {
      if (effect.type === "attribute") pool[effect.target] += effect.amount
    }
  }

  for (const effect of activePassiveEffects(character)) {
    if (effect.type === "attribute") pool[effect.target] += effect.amount
  }

  for (const effect of activeMechanicEffects(character)) {
    if (effect.type === "attribute") pool[effect.target] += effect.amount
  }

  for (const target of BONUS_TARGET_KEYS) {
    pool[target] += character.manualBonuses[target] ?? 0
  }

  return pool
}

/**
 * The character's displayed Attributes: active Archetype's scores, plus
 * permanent bonuses (Mastery, equipment, manual), each clamped to [-7, +7]
 * after all sources are summed.
 */
export function computeAttributes(
  character: StatComputationCharacter
): AttributeScores {
  const bonuses = accumulatedBonuses(character)
  const active = character.activeArchetypeKey
    ? getArchetype(character.activeArchetypeKey)
    : undefined

  const scores = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS) {
    const base = active ? active.attributes[key] : 0
    scores[key] = clamp(base + bonuses[key], ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }
  return scores
}

function levelsGained(level: number): number {
  return Math.max(0, level - 1)
}

/**
 * Max HP: path's starting HP, plus the averaged Hit Die gain for every level
 * after the first, plus permanent HP bonuses (Mastery, equipment, manual).
 * MVP uses averaged Hit Dice only — no rolled values.
 */
export function computeMaxHP(character: StatComputationCharacter): number {
  const path = PATH_STATS[character.pathChoice]
  const total =
    path.startHP +
    levelsGained(character.level) * path.hpPerLevel +
    accumulatedBonuses(character).hp
  return Math.round(total)
}

/**
 * Max SP: analogous to {@link computeMaxHP} using the Skill Dice gain and
 * permanent SP bonuses.
 */
export function computeMaxSP(character: StatComputationCharacter): number {
  const path = PATH_STATS[character.pathChoice]
  const total =
    path.startSP +
    levelsGained(character.level) * path.spPerLevel +
    accumulatedBonuses(character).sp
  return Math.round(total)
}

/**
 * Total Hit Dice a character of `level` has: 2 at Level 1, +1 per level
 * thereafter (rulebook 1.1). Like max HP/SP this is derived from level and
 * never stored; only the consumable `hitDiceRemaining` pool is tracked.
 */
export function computeMaxHitDice(level: number): number {
  return level + 1
}

/**
 * Total Skill Dice a character of `level` has: 5 at Level 1, +2 per level
 * thereafter (rulebook 1.1). Derived from level and never stored; only the
 * consumable `skillDiceRemaining` pool is tracked.
 */
export function computeMaxSkillDice(level: number): number {
  return 2 * level + 3
}

/**
 * Priority used to pick a winner when several equipment or passive-Skill
 * effects touch the same damage type. Higher wins:
 * Drain > Repel > Null > Resist > Neutral > Weak.
 */
const AFFINITY_PRIORITY: Record<Affinity, number> = {
  drain: 5,
  repel: 4,
  null: 3,
  resist: 2,
  neutral: 1,
  weak: 0,
}

function strongest(candidates: readonly Affinity[]): Affinity | undefined {
  let best: Affinity | undefined
  for (const candidate of candidates) {
    if (
      best === undefined ||
      AFFINITY_PRIORITY[candidate] > AFFINITY_PRIORITY[best]
    ) {
      best = candidate
    }
  }
  return best
}

/**
 * The character's displayed Affinity chart, resolved per damage type in
 * layers: an `overrides` entry wins outright; otherwise any Affinity granted
 * by equipment or by the active Archetype's passive Skills replaces the
 * Archetype base (strongest by {@link AFFINITY_PRIORITY} when several
 * collide); otherwise the active Archetype's chart applies (uncharted types
 * and Almighty are Neutral).
 *
 * `overrides` carry transient, combat-driven changes the UI sets (e.g. an
 * enemy Skill forcing Weak, or a self-cast Resist) — that targeted-effect kind
 * of Affinity change is not modelled as passive-Skill data. UI wiring is out
 * of scope; only the `overrides` parameter is supported here.
 */
export function computeAffinityChart(
  character: StatComputationCharacter,
  overrides?: Partial<Record<DamageType, Affinity>>
): Record<DamageType, Affinity> {
  const active = character.activeArchetypeKey
    ? getArchetype(character.activeArchetypeKey)
    : undefined

  const candidatesByType = new Map<DamageType, Affinity[]>()
  const addCandidate = (damageType: DamageType, affinity: Affinity) => {
    const list = candidatesByType.get(damageType) ?? []
    list.push(affinity)
    candidatesByType.set(damageType, list)
  }

  for (const item of character.equippedItems) {
    for (const effect of item.effects ?? []) {
      if (effect.type !== "affinity") continue
      for (const damageType of effect.damageTypes) {
        addCandidate(damageType, effect.affinity)
      }
    }
  }

  for (const effect of activePassiveEffects(character)) {
    if (effect.type !== "affinity") continue
    for (const damageType of effect.damageTypes) {
      addCandidate(damageType, effect.affinity)
    }
  }

  for (const effect of activeMechanicEffects(character)) {
    if (effect.type !== "affinity") continue
    for (const damageType of effect.damageTypes) {
      addCandidate(damageType, effect.affinity)
    }
  }

  const chart = {} as Record<DamageType, Affinity>
  for (const damageType of DAMAGE_TYPES) {
    const override = overrides?.[damageType]
    if (override !== undefined) {
      chart[damageType] = override
      continue
    }

    if (damageType === "almighty") {
      chart[damageType] = "neutral"
      continue
    }

    const granted = strongest(candidatesByType.get(damageType) ?? [])
    if (granted !== undefined) {
      chart[damageType] = granted
      continue
    }

    chart[damageType] = active ? resolveAffinity(active, damageType) : "neutral"
  }
  return chart
}
