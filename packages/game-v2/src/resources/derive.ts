import {
  dice,
  flat,
  type DamageFormula,
} from "@workspace/game-v2/combat/formula"

/**
 * The pure consumable-dice maxima, re-homed from v1
 * (`packages/game/src/engine/character/stats/stats.ts`). Derived from level, never
 * stored — `resolve` derives `current = max(0, max − used)` against the entity's
 * `Resources` spend-state; the golden-master proves the numbers match v1 exactly.
 */

/** Total Hit Dice: 2 at L1, +1 per level (derived from level, never stored). */
export function computeMaxHitDice(level: number): number {
  return level + 1
}

/** Total Skill Dice: 5 at L1, +2 per level. */
export function computeMaxSkillDice(level: number): number {
  return 2 * level + 3
}

/**
 * Prisma flask charges (rulebook 2.6): 2 base. The 5-color upgrade tree that
 * grows this is unshipped (D26) — when it lands, the max becomes a derivation
 * over the entity's upgrades and this constant becomes its base term.
 */
export const PRISMA_BASE_CHARGES = 2

/**
 * The Prisma heal per charge (rulebook 2.6): 2d8+4 HP, a Standard Action to
 * drink. Constant until the Red upgrades ship; structured so surfaces render it
 * through `renderFormula` like every other formula.
 */
export const PRISMA_HEAL: DamageFormula = [dice(2, 8), flat(4)]
