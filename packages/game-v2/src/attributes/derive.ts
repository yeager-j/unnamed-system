import {
  emptyBonusPool,
  type BonusPool,
} from "@workspace/game-v2/kernel/bonus-pool"
import type { AttributeEffect } from "@workspace/game-v2/kernel/effects.schema"
import type {
  AttributeKey,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"

/**
 * The pure Attribute derivation math, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts`). Small pure transforms
 * over explicit values — no catalog lookup, no I/O. `resolve` assembles the inputs
 * and composes these; the golden-master proves the numbers match v1 exactly.
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

/**
 * Effective Attributes: the **sum of every source** (the entity base, the
 * Archetype layer, the bonus pool, …), each Attribute clamped to [-7, +7] once
 * **after** summing (C1). Variadic so `resolve` folds all the layers in a single
 * pass — a source need only carry the four Attribute keys ({@link BonusPool}'s
 * HP/SP are simply ignored here).
 */
export function computeAttributes(
  ...sources: ReadonlyArray<Record<AttributeKey, number> | undefined>
): AttributeScores {
  const out = {} as AttributeScores
  for (const key of ATTRIBUTE_KEYS_ORDER) {
    let total = 0
    for (const source of sources) total += source?.[key] ?? 0
    out[key] = clamp(total, ATTRIBUTE_MIN, ATTRIBUTE_MAX)
  }
  return out
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
