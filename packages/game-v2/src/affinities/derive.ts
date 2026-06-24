import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import {
  DAMAGE_TYPES,
  type Affinity,
  type AffinityChart,
  type DamageType,
  type PartialAffinityChart,
} from "@workspace/game-v2/kernel/vocab"

/**
 * The pure Affinity derivation math, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts`). Small pure transforms
 * over explicit values — no catalog lookup, no I/O. `resolve` assembles the inputs
 * and composes these; the golden-master proves the numbers match v1 exactly.
 */

/** Higher wins when several sources chart one damage type. */
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

/** A chart's Affinity to a damage type (absent ⇒ Neutral; Almighty always Neutral). */
export function resolveAffinity(
  chart: PartialAffinityChart,
  damageType: DamageType
): Affinity {
  if (damageType === "almighty") return "neutral"
  return chart[damageType] ?? "neutral"
}

/**
 * Folds the Affinity effects of any effect list into a {@link PartialAffinityChart}
 * — one Affinity per charted damage type, the **strongest** among the effects that
 * touch it (other effect kinds ignored). This turns the effect channel into one
 * more chart source {@link computeAffinityChart} folds, mirroring how
 * {@link attributeEffectBonuses} turns effects into a bonus pool for
 * {@link computeAttributes}. (Affinity effects can't target Almighty — the schema
 * restricts them to the chartable types — so the conversion is lossless.)
 */
export function affinityEffectChart(
  effects: readonly CombatantEffect[]
): PartialAffinityChart {
  const chart: PartialAffinityChart = {}
  for (const effect of effects) {
    if (effect.type !== "affinity") continue
    for (const damageType of effect.damageTypes) {
      const existing = chart[damageType]
      chart[damageType] = existing
        ? (strongest([existing, effect.affinity]) ?? effect.affinity)
        : effect.affinity
    }
  }
  return chart
}

/**
 * The resolved Affinity chart, folded per damage type by **strongest-wins** across
 * every contributed source — the entity base, the active Archetype layer, and the
 * effect-derived chart ({@link affinityEffectChart}; mechanic now, zone/equipment/
 * passive in their PRs). Variadic so `resolve` folds all the layers in a single
 * pass, mirroring {@link computeAttributes}: an absent source (or an absent entry
 * within a source) contributes nothing; a type no source charts — and Almighty,
 * which can't be resisted — resolves to Neutral.
 *
 * **Strongest-wins, base included** (game-design call, UNN-502 — simplifies D18's
 * "later layer wins" for affinities): a stronger affinity from any source is
 * **not** downgraded by a weaker one — an innate Null is kept over a Resist from
 * gear; a Weak base is upgraded by a Resist from gear. There are no
 * weakening/"cursed" sources today; if they ship, this is where the rule grows.
 */
export function computeAffinityChart(
  ...sources: ReadonlyArray<PartialAffinityChart | undefined>
): AffinityChart {
  const chart = {} as AffinityChart
  for (const damageType of DAMAGE_TYPES) {
    if (damageType === "almighty") {
      chart[damageType] = "neutral"
      continue
    }
    const contributions: Affinity[] = []
    for (const source of sources) {
      const affinity = source?.[damageType]
      if (affinity !== undefined) contributions.push(affinity)
    }
    chart[damageType] = strongest(contributions) ?? "neutral"
  }
  return chart
}
