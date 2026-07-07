/**
 * The **resolved** resource/exhaustion read-units `resolve` emits (D30) — derived
 * values only, never the authored `*Used` counts or the raw level (F3).
 */

/**
 * Resolved consumable capability: the level-derived dice maxima (PR2) and the
 * Prisma cap (base 2 until the upgrade tree ships, S2a), each with the derived
 * `current = max(0, max − used)`. The heal-per-charge display formula is the
 * `PRISMA_HEAL` constant in `derive.ts`, not per-entity data.
 */
export interface ResolvedResources {
  maxHitDice: number
  currentHitDice: number
  maxSkillDice: number
  currentSkillDice: number
  maxPrisma: number
  currentPrisma: number
}

/**
 * Resolved Exhaustion: the durable `level` and its table-derived `description`
 * (D27). The 1–6 descriptions are placeholders until the rulebook table ships.
 */
export interface ResolvedExhaustion {
  level: number
  description: string
}
