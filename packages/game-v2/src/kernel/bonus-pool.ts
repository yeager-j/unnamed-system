import {
  BONUS_TARGET_KEYS,
  type BonusTargetKey,
} from "@workspace/game-v2/kernel/effects.schema"

/**
 * The **bonus pool** primitive — a flat pool of additive bonuses keyed by
 * {@link BonusTargetKey} (HP/SP + the four Attributes), the shared currency every
 * derivation source contributes into and that `resolve` folds once per derive.
 *
 * Re-homed from v1 (`engine/character/stats/stats.ts`). It depends only on the
 * kernel effect vocab, so it lives in `kernel/` (the dependency sink) — the
 * per-domain pool *builders* (mastery, manual, attribute effects) live with their
 * domains and produce this shape.
 */

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
