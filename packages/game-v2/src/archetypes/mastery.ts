import {
  hasMasteryBonus,
  type Mastery,
} from "@workspace/game-v2/archetypes/archetype"
import {
  emptyBonusPool,
  type BonusPool,
} from "@workspace/game-v2/kernel/bonus-pool"

/**
 * The Archetype **Mastery** contribution to the bonus pool, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts`). Pure: it walks the roster
 * and folds each at-or-above-rank Archetype's Mastery into a {@link BonusPool} —
 * `resolve` sums this with the other pool sources.
 *
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
