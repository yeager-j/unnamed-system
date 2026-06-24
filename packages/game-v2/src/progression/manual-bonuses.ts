import {
  emptyBonusPool,
  type BonusPool,
} from "@workspace/game-v2/kernel/bonus-pool"
import { BONUS_TARGET_KEYS } from "@workspace/game-v2/kernel/effects.schema"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"

/**
 * The manually-entered {@link ManualBonuses} as a {@link BonusPool}, re-homed from
 * v1 (`packages/game/src/engine/character/stats/stats.ts`). Sparse — a missing key
 * is `0` — so `resolve` can sum it with the other pool sources uniformly.
 */
export function manualBonusPool(manual: ManualBonuses): BonusPool {
  const pool = emptyBonusPool()
  for (const target of BONUS_TARGET_KEYS) pool[target] = manual[target] ?? 0
  return pool
}
