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
