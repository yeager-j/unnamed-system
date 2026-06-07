import { getArchetype } from "@workspace/game/data/archetypes/registry"
import { resolveAffinity } from "@workspace/game/engine/archetypes/affinity"
import { hasMasteryBonus } from "@workspace/game/engine/archetypes/rank"
import { mechanicEffectsFor } from "@workspace/game/engine/mechanics/registry"
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
} from "@workspace/game/foundation/archetypes/schema"
import type {
  ManualBonuses,
  PathChoice,
} from "@workspace/game/foundation/character/state"
import {
  DAMAGE_TYPES,
  type Affinity,
  type DamageType,
} from "@workspace/game/foundation/combat/affinity"
import {
  BONUS_TARGET_KEYS,
  type AffinityEffect,
  type AttackRollEffect,
  type AttributeEffect,
  type BonusTargetKey,
} from "@workspace/game/foundation/combat/effects"
import { type EquippableItem } from "@workspace/game/foundation/items/schema"
import {
  type MechanicKind,
  type MechanicState,
} from "@workspace/game/foundation/mechanics/schema"
import { type MechanicEffect } from "@workspace/game/foundation/mechanics/types"
import { type Skill } from "@workspace/game/foundation/skills/schema"

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
export interface StatContext {
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
  /**
   * The provenance-neutral **base** Attribute scores the bonus pool stacks on
   * top of: a character fills these from its active Archetype's intrinsics (or
   * zeros when none), an enemy from its flat stat block. Resolved once at the
   * assembly site ({@link buildStatContext}) via {@link baseAttributesForArchetype}
   * so {@link computeAttributes} owns no Archetype lookup and works for any
   * combatant.
   */
  baseAttributes: AttributeScores
  /**
   * The provenance-neutral **base** Affinity chart the equipment / passive /
   * mechanic layers override (see {@link computeAffinityChart}). A character
   * fills it from its Archetype chart via {@link baseAffinitiesForArchetype}, an
   * enemy from its flat affinities — so the chart resolver, like
   * {@link computeAttributes}, no longer reaches into the Archetype catalog.
   */
  baseAffinities: Record<DamageType, Affinity>
}

export type AttributeScores = Record<AttributeKey, number>

/**
 * The base Attribute scores an Archetype confers (its intrinsic scores), or all
 * zeros when there is no active Archetype. The {@link StatContext} assembly site
 * calls this so the pure {@link computeAttributes} reads a plain field instead of
 * looking up the catalog — which is what lets a non-character combatant (an enemy
 * with flat scores) flow through the same computation.
 */
export function baseAttributesForArchetype(
  archetypeKey: string | null
): AttributeScores {
  const archetype = archetypeKey ? getArchetype(archetypeKey) : undefined
  const scores = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS) {
    scores[key] = archetype ? archetype.attributes[key] : 0
  }
  return scores
}

/**
 * The base Affinity chart an Archetype confers (every damage type resolved via
 * {@link resolveAffinity}; uncharted types and Almighty are Neutral), or an
 * all-Neutral chart when there is no active Archetype. The peer of
 * {@link baseAttributesForArchetype} for {@link computeAffinityChart}.
 */
export function baseAffinitiesForArchetype(
  archetypeKey: string | null
): Record<DamageType, Affinity> {
  const archetype = archetypeKey ? getArchetype(archetypeKey) : undefined
  const chart = {} as Record<DamageType, Affinity>
  for (const damageType of DAMAGE_TYPES) {
    chart[damageType] = archetype
      ? resolveAffinity(archetype, damageType)
      : "neutral"
  }
  return chart
}

const ATTRIBUTE_MIN = -7
const ATTRIBUTE_MAX = 7

/**
 * Starting HP/SP and per-level gains by path. The per-level HP figure is the
 * Hit Die average rounded up D&D-style (d12→7, d10→6, d8→5); per-level SP is
 * two Skill Dice averaged, which is already whole (9 / 11 / 13). Source:
 * rulebook `1.1 HP and SP`. Encoded as the published per-path totals rather
 * than re-derived from die size.
 */
export interface PathStats {
  startHP: number
  startSP: number
  hpPerLevel: number
  spPerLevel: number
}

const PATH_STATS: Record<PathChoice, PathStats> = {
  "health-focused": { startHP: 24, startSP: 40, hpPerLevel: 7, spPerLevel: 9 },
  balanced: { startHP: 20, startSP: 50, hpPerLevel: 6, spPerLevel: 11 },
  "skill-focused": { startHP: 16, startSP: 60, hpPerLevel: 5, spPerLevel: 13 },
}

/**
 * Path-stats lookup for display surfaces (the builder's HP/SP path picker, any
 * future level-up walkthrough). The same source of truth the {@link computeMaxHP}
 * / {@link computeMaxSP} math reads from, so a path's published numbers can't
 * drift between the engine and the UI.
 */
export function getPathStats(pathChoice: PathChoice): PathStats {
  return PATH_STATS[pathChoice]
}

/**
 * Per-path Hit Die and Skill Die sizes (rulebook 1.1). The app never rolls,
 * but the Rest dialog surfaces the die size next to the spend inputs so the
 * player knows what to roll externally and enter back. Source-of-truth lives
 * here next to {@link PATH_STATS}; the per-level HP/SP figures in
 * {@link PATH_STATS} are the averaged Hit Die / two-Skill-Dice values that
 * these dice round-trip to.
 */
export interface PathDice {
  hitDie: 8 | 10 | 12
  skillDie: 8 | 10 | 12
}

const PATH_DICE: Record<PathChoice, PathDice> = {
  "health-focused": { hitDie: 12, skillDie: 8 },
  balanced: { hitDie: 10, skillDie: 10 },
  "skill-focused": { hitDie: 8, skillDie: 12 },
}

export function getPathDice(pathChoice: PathChoice): PathDice {
  return PATH_DICE[pathChoice]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export type BonusPool = Record<BonusTargetKey, number>

function emptyBonusPool(): BonusPool {
  return { hp: 0, sp: 0, strength: 0, magic: 0, agility: 0, luck: 0 }
}

/**
 * Combines several bonus pools into one by summing each target across them.
 * Each source helper returns a full pool (zeroed for untouched targets), so the
 * combiner needs no knowledge of which source contributes to which target.
 */
function sumBonuses(...pools: BonusPool[]): BonusPool {
  const total = emptyBonusPool()
  for (const pool of pools) {
    for (const target of BONUS_TARGET_KEYS) total[target] += pool[target]
  }
  return total
}

/**
 * Flattens the structured effects of the active Archetype's passive Skills.
 * Non-passive Skills carry no structured effects (schema-enforced) and are
 * skipped.
 */
function activePassiveEffects(
  character: StatContext
): Array<AffinityEffect | AttributeEffect | AttackRollEffect> {
  // Stryker disable next-line ArrayDeclaration: equivalent — every consumer
  // type-filters these effects (on `type`), so a seeded junk element is ignored.
  const effects: Array<AffinityEffect | AttributeEffect | AttackRollEffect> = []
  for (const skill of character.activeSkills) {
    // Stryker disable next-line ConditionalExpression: equivalent — only passive
    // Skills carry structured effects (schema), so not skipping a non-passive
    // adds nothing.
    if (skill.kind !== "passive") continue
    // Stryker disable next-line ArrayDeclaration: equivalent — junk seed is
    // type-filtered downstream; the `?? []` only guards a passive with no effects.
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
function activeMechanicEffects(character: StatContext): MechanicEffect[] {
  const active = character.activeMechanic
  // Stryker disable next-line ArrayDeclaration: equivalent — the no-mechanic
  // return is type-filtered by every consumer; a junk array contributes nothing.
  if (!active) return []
  // Stryker disable next-line ObjectLiteral: equivalent — no current mechanic's
  // `effects()` reads `ctx.stats`; the context is reserved plumbing for a future
  // stat-dependent mechanic (see UNN-354 on where catalog reads should live).
  return mechanicEffectsFor(active.kind, active.state, { stats: character })
}

/**
 * Mastery bonuses: every Archetype at or above its Mastery Rank (active or not)
 * contributes its Mastery effect. Derived from Rank here, never read from
 * storage, so an inactive Mastered Archetype still contributes.
 */
function masteryBonuses(character: StatContext): BonusPool {
  const pool = emptyBonusPool()
  for (const { key, rank } of character.archetypes) {
    if (!hasMasteryBonus(rank)) continue
    const archetype = getArchetype(key)
    if (!archetype) continue

    const { mastery } = archetype
    switch (mastery.kind) {
      case "hp":
        pool.hp += mastery.amount
        break
      case "sp":
        pool.sp += mastery.amount
        break
      // Stryker disable next-line ConditionalExpression: equivalent — the default (attribute-kind Mastery) is demo-only (absent from the test catalog), so removing it changes nothing here; reachable once UNN-354 lifts the catalog lookup to the assembly boundary.
      default:
        // Stryker disable next-line AssignmentOperator: equivalent — attribute-kind Mastery is demo-only (see above / UNN-354).
        pool[mastery.attribute] += mastery.amount
    }
  }
  return pool
}

function isAttributeEffect(effect: {
  type: string
}): effect is AttributeEffect {
  // Stryker disable next-line ConditionalExpression: equivalent — a non-attribute effect carries no BonusTargetKey `target`, so treating it as one writes only a junk `pool[undefined]` that no consumer reads.
  return effect.type === "attribute"
}

/**
 * Folds any list of structured effects into a pool, applying only the Attribute
 * effects (the sole kind that touches a {@link BonusTargetKey}). Shared by the
 * item, passive-Skill, and mechanic sources, whose Attribute contributions are
 * identical in shape.
 */
function attributeEffectBonuses(
  effects: ReadonlyArray<{ type: string }>
): BonusPool {
  const pool = emptyBonusPool()
  for (const effect of effects) {
    // Stryker disable next-line ConditionalExpression: equivalent — see isAttributeEffect; applying a non-attribute effect writes only `pool[undefined]`.
    if (isAttributeEffect(effect)) pool[effect.target] += effect.amount
  }
  return pool
}

/** Attribute effects conferred by currently-equipped items. */
function itemBonuses(character: StatContext): BonusPool {
  return attributeEffectBonuses(
    // Stryker disable next-line ArrayDeclaration: equivalent — junk seed is
    // type-filtered by attributeEffectBonuses (matches on `type`).
    character.equippedItems.flatMap((item) => item.equip.effects ?? [])
  )
}

/** Attribute effects of the active Archetype's passive Skills. */
function passiveSkillBonuses(character: StatContext): BonusPool {
  return attributeEffectBonuses(activePassiveEffects(character))
}

/** Attribute effects emitted by the active Archetype's mechanic. */
function mechanicBonuses(character: StatContext): BonusPool {
  return attributeEffectBonuses(activeMechanicEffects(character))
}

/** The character's manually-entered bonuses. */
function manualBonusPool(character: StatContext): BonusPool {
  const pool = emptyBonusPool()
  for (const target of BONUS_TARGET_KEYS) {
    pool[target] = character.manualBonuses[target] ?? 0
  }
  return pool
}

/**
 * Sums every permanent, source-agnostic bonus — Mastery, equipped-item
 * Attribute effects, the active Archetype's passive-Skill and mechanic Attribute
 * effects, and the manually-entered bonuses — into one pool. Built once per
 * derive and shared across {@link computeAttributes}, {@link computeMaxHP}, and
 * {@link computeMaxSP} so the sources are walked a single time.
 */
export function accumulatedBonuses(character: StatContext): BonusPool {
  return sumBonuses(
    masteryBonuses(character),
    itemBonuses(character),
    passiveSkillBonuses(character),
    mechanicBonuses(character),
    manualBonusPool(character)
  )
}

/**
 * The character's displayed Attributes: active Archetype's scores, plus
 * permanent bonuses (Mastery, equipment, manual), each clamped to [-7, +7]
 * after all sources are summed.
 */
export function computeAttributes(
  character: StatContext,
  bonuses: BonusPool = accumulatedBonuses(character)
): AttributeScores {
  const scores = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS) {
    scores[key] = clamp(
      character.baseAttributes[key] + bonuses[key],
      ATTRIBUTE_MIN,
      ATTRIBUTE_MAX
    )
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
export function computeMaxHP(
  character: StatContext,
  bonuses: BonusPool = accumulatedBonuses(character)
): number {
  const path = PATH_STATS[character.pathChoice]
  const total =
    path.startHP + levelsGained(character.level) * path.hpPerLevel + bonuses.hp
  return Math.round(total)
}

/**
 * Max SP: analogous to {@link computeMaxHP} using the Skill Dice gain and
 * permanent SP bonuses.
 */
export function computeMaxSP(
  character: StatContext,
  bonuses: BonusPool = accumulatedBonuses(character)
): number {
  const path = PATH_STATS[character.pathChoice]
  const total =
    path.startSP + levelsGained(character.level) * path.spPerLevel + bonuses.sp
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
      // Stryker disable next-line EqualityOperator: equivalent — AFFINITY_PRIORITY
      // is a bijection, so no two distinct affinities tie; `>=` never differs.
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
  character: StatContext,
  overrides?: Partial<Record<DamageType, Affinity>>
): Record<DamageType, Affinity> {
  const candidatesByType = new Map<DamageType, Affinity[]>()
  const addCandidate = (damageType: DamageType, affinity: Affinity) => {
    const list = candidatesByType.get(damageType) ?? []
    list.push(affinity)
    candidatesByType.set(damageType, list)
  }

  for (const item of character.equippedItems) {
    // Stryker disable next-line ArrayDeclaration: equivalent — junk seed is
    // filtered by the `effect.type !== "affinity"` guard below.
    for (const effect of item.equip.effects ?? []) {
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

    // No Almighty special-case needed: Affinity effects can't target Almighty
    // (it is absent from AFFINITY_DAMAGE_TYPES), so it never has a candidate and
    // always falls through to its Neutral base (resolveAffinity guarantees it).
    const granted = strongest(candidatesByType.get(damageType) ?? [])
    if (granted !== undefined) {
      chart[damageType] = granted
      continue
    }

    chart[damageType] = character.baseAffinities[damageType]
  }
  return chart
}
