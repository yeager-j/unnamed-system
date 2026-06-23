import { hasMasteryBonus, type Mastery } from "@workspace/game-v2/archetypes"
import {
  BONUS_TARGET_KEYS,
  type AffinityEffect,
  type AttributeEffect,
  type BonusTargetKey,
} from "@workspace/game-v2/kernel/effects.schema"
import {
  DAMAGE_TYPES,
  type Affinity,
  type AffinityChart,
  type AffinityDamageType,
  type AttributeKey,
  type AttributeScores,
  type DamageType,
  type PartialAffinityChart,
  type PathChoice,
} from "@workspace/game-v2/kernel/vocab"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"
import type { Progression } from "@workspace/game-v2/progression/progression.schema"

/**
 * The pure derivation math, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts` + `archetypes/`). Every
 * function is a small pure transform over explicit values — no `StatProfile`
 * aggregate, no catalog lookup, no I/O. `resolve` assembles the inputs and
 * composes these; the golden-master proves the numbers match v1 exactly.
 */

const ATTRIBUTE_KEYS_ORDER = [
  "strength",
  "magic",
  "agility",
  "luck",
] as const satisfies readonly AttributeKey[]

const ATTRIBUTE_MIN = -7
const ATTRIBUTE_MAX = 7

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Starting HP/SP and per-level gains by path (rulebook 1.1; averaged dice). */
interface PathStats {
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

/** Levels gained past the first — what the per-level HP/SP/dice gains scale by. */
function levelsGained(level: number): number {
  return Math.max(0, level - 1)
}

// --- Bonus pool (the six-source sum) -----------------------------------------

/** A pool of flat bonuses keyed by {@link BonusTargetKey} (HP/SP + four Attributes). */
export type BonusPool = Record<BonusTargetKey, number>

export function emptyBonusPool(): BonusPool {
  return { hp: 0, sp: 0, strength: 0, magic: 0, agility: 0, luck: 0 }
}

/** Sums any number of pools target-by-target. */
export function sumBonuses(...pools: BonusPool[]): BonusPool {
  const total = emptyBonusPool()
  for (const pool of pools) {
    for (const target of BONUS_TARGET_KEYS) total[target] += pool[target]
  }
  return total
}

/**
 * Mastery pool: every owned Archetype at or above its Mastery Rank (active **or
 * not** — C4) contributes its Mastery effect, derived from rank, never stored.
 * `masteryOf` resolves an Archetype key to its {@link Mastery} (the `getArchetype`
 * port slice).
 */
export function masteryBonuses(
  roster: ReadonlyArray<{ key: string; rank: number }>,
  masteryOf: (key: string) => Mastery | undefined
): BonusPool {
  const pool = emptyBonusPool()
  for (const { key, rank } of roster) {
    if (!hasMasteryBonus(rank)) continue
    const mastery = masteryOf(key)
    if (!mastery) continue
    switch (mastery.kind) {
      case "hp":
        pool.hp += mastery.amount
        break
      case "sp":
        pool.sp += mastery.amount
        break
      case "attribute":
        pool[mastery.attribute] += mastery.amount
        break
    }
  }
  return pool
}

/** Folds the Attribute effects of any effect list into a pool (other kinds ignored). */
export function attributeEffectBonuses(
  effects: ReadonlyArray<{ type: string }>
): BonusPool {
  const pool = emptyBonusPool()
  for (const effect of effects) {
    if (isAttributeEffect(effect)) pool[effect.target] += effect.amount
  }
  return pool
}

function isAttributeEffect(effect: {
  type: string
}): effect is AttributeEffect {
  return effect.type === "attribute"
}

/** The character's manually-entered bonuses as a pool. */
export function manualBonusPool(manual: ManualBonuses): BonusPool {
  const pool = emptyBonusPool()
  for (const target of BONUS_TARGET_KEYS) pool[target] = manual[target] ?? 0
  return pool
}

// --- Attributes / pools -------------------------------------------------------

/**
 * Sums every Attribute source target-by-target **without clamping** — a source
 * need only carry the four Attribute keys ({@link BonusPool}'s HP/SP are ignored).
 * The unclamped sum is what a {@link import("./resolve").Form} carries for its base
 * Attributes (entity base + Archetype layer), so the clamp lands exactly once in
 * {@link computeAttributes} after the delta pool folds in (C1).
 */
export function sumAttributeSources(
  ...sources: ReadonlyArray<Record<AttributeKey, number> | undefined>
): AttributeScores {
  const out = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS_ORDER) {
    let total = 0
    for (const source of sources) total += source?.[key] ?? 0
    out[key] = total
  }
  return out
}

/**
 * Effective Attributes: the **sum of every source** (the form's base Attributes,
 * the bonus pool, …), each Attribute clamped to [-7, +7] once **after** summing
 * (C1). Variadic so `resolve` folds the form + delta pool in one pass.
 */
export function computeAttributes(
  ...sources: ReadonlyArray<Record<AttributeKey, number> | undefined>
): AttributeScores {
  const summed = sumAttributeSources(...sources)
  const out = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS_ORDER) {
    out[key] = clamp(summed[key], ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }
  return out
}

/** The Progression layer's HP contribution — path start + per-level gain × levels gained. */
function pathMaxHP(pathChoice: PathChoice, level: number): number {
  const path = PATH_STATS[pathChoice]
  return path.startHP + levelsGained(level) * path.hpPerLevel
}

/** The Progression layer's SP contribution — analogous to {@link pathMaxHP}. */
function pathMaxSP(pathChoice: PathChoice, level: number): number {
  const path = PATH_STATS[pathChoice]
  return path.startSP + levelsGained(level) * path.spPerLevel
}

/**
 * The Progression path/level layer's HP contribution — `0` for an entity with no
 * `Progression` (D37). A {@link import("./resolve").Form}'s base maxHP is
 * `Vitals.base + progressionMaxHP(progression)`; the HP delta pool folds in later,
 * in `resolveForm`. Kept separate from {@link progressionMaxSP} (no shared
 * abstraction): HP and SP share a shape today but are free to diverge.
 */
export function progressionMaxHP(progression: Progression | undefined): number {
  return progression ? pathMaxHP(progression.pathChoice, progression.level) : 0
}

/** The Progression path/level layer's SP contribution — the SP peer of {@link progressionMaxHP}. */
export function progressionMaxSP(progression: Progression | undefined): number {
  return progression ? pathMaxSP(progression.pathChoice, progression.level) : 0
}

/** Total Hit Dice: 2 at L1, +1 per level (derived from level, never stored). */
export function computeMaxHitDice(level: number): number {
  return level + 1
}

/** Total Skill Dice: 5 at L1, +2 per level. */
export function computeMaxSkillDice(level: number): number {
  return 2 * level + 3
}

// --- Affinities ---------------------------------------------------------------

/** Higher wins when several effects touch one damage type. */
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

/** An Archetype/flat chart's Affinity to a damage type (absent ⇒ Neutral; Almighty always Neutral). */
export function resolveAffinity(
  chart: PartialAffinityChart,
  damageType: DamageType
): Affinity {
  if (damageType === "almighty") return "neutral"
  return chart[damageType as AffinityDamageType] ?? "neutral"
}

/**
 * The resolved Affinity chart, folded per damage type: the strongest granted
 * **candidate** (by {@link AFFINITY_PRIORITY}) wins; else the form's **base**
 * Affinity (absent/Almighty ⇒ Neutral). The base is the active
 * {@link import("./resolve").Form}'s chart (a PC's entity-base merged with its
 * Archetype, or a swapped form's), assembled in `naturalForm`; candidates come
 * from the later layers (zone now; equipment/passive/mechanic join in their PRs),
 * which therefore **override** the form's Affinity (D18 — later layers win).
 */
export function computeAffinityChart(
  base: PartialAffinityChart,
  candidateEffects: readonly AffinityEffect[]
): AffinityChart {
  const candidatesByType = new Map<DamageType, Affinity[]>()
  for (const effect of candidateEffects) {
    for (const damageType of effect.damageTypes) {
      const list = candidatesByType.get(damageType) ?? []
      list.push(effect.affinity)
      candidatesByType.set(damageType, list)
    }
  }

  const chart = {} as AffinityChart
  for (const damageType of DAMAGE_TYPES) {
    const granted = strongest(candidatesByType.get(damageType) ?? [])
    chart[damageType] = granted ?? resolveAffinity(base, damageType)
  }
  return chart
}
