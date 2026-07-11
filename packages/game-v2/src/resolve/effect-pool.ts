import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"

/**
 * The **C6 contributor order** (UNN-599), as data. The delta-effect pool
 * `resolveEntity` feeds `resolve` is assembled from four channels; the order they
 * fold in used to be an array-literal position guarded by a normative comment in
 * `resolve-entity.ts`. That comment was an unexecuted contract — the ordering was a
 * hidden input and the `sources[]` display readout rode on it silently. Here it is
 * a single declared rank instead (Code Style #8/#9): the assembly may list the
 * channels in any order, and {@link orderEffectPool} restores this canonical one.
 *
 * Order only matters for `attackRoll`/`damage` effects — they surface through
 * `resolve` → `pendingEffects` → `resolveAttackRollFrom` → `sources[]` in pool
 * order. Affinity is strongest-wins and attribute is summed (both
 * order-independent), and equipment emits neither attack-roll nor damage effects,
 * so its rank is immaterial to `sources[]` — it simply sits in the equipment slot.
 */
export const EFFECT_CONTRIBUTORS = [
  "mechanic",
  "skill",
  "equipment",
  "context",
] as const

export type EffectContributor = (typeof EFFECT_CONTRIBUTORS)[number]

/** The single declared rank: a contributor's index in {@link EFFECT_CONTRIBUTORS}. */
const CONTRIBUTOR_RANK: Record<EffectContributor, number> = Object.fromEntries(
  EFFECT_CONTRIBUTORS.map((contributor, rank) => [contributor, rank])
) as Record<EffectContributor, number>

/**
 * A delta effect paired with the channel that emitted it — a **resolve-time only**
 * annotation (the `contributor` never enters an effect's authored Zod shape, so the
 * load seam and the arbitraries are untouched). {@link orderEffectPool} sorts by it,
 * then hands `resolve` bare effects; nothing downstream of the fold sees it.
 */
export interface SourcedEffect {
  contributor: EffectContributor
  effect: CombatantEffect
}

/** Pairs each effect with the channel that emitted it. */
export function stampEffects(
  contributor: EffectContributor,
  effects: readonly CombatantEffect[]
): SourcedEffect[] {
  return effects.map((effect) => ({ contributor, effect }))
}

/**
 * The canonical delta-effect pool: a **stable** sort by declared contributor rank,
 * returning the bare effects. Stability preserves each channel's own internal order
 * (the parity-frozen `sources[]` order within a contributor), so this is invariant
 * to the order the four channels were assembled in but faithful to today's output.
 */
export function orderEffectPool(
  sourced: readonly SourcedEffect[]
): CombatantEffect[] {
  return [...sourced]
    .sort(
      (a, b) =>
        CONTRIBUTOR_RANK[a.contributor] - CONTRIBUTOR_RANK[b.contributor]
    )
    .map((s) => s.effect)
}
