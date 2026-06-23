/**
 * The **resolved** resource/exhaustion read-units `resolve` emits (D30) — derived
 * values only, never the authored `*Used` counts or the raw level (F3).
 */

/**
 * Resolved consumable-dice capability: the level-derived maxima (PR2) plus the
 * derived `current = max(0, max − used)`. Prisma carries **no** resolved maximum
 * yet — its derivation waits on the upgrade tree (D26) — so it is absent here.
 */
export interface ResolvedResources {
  maxHitDice: number
  currentHitDice: number
  maxSkillDice: number
  currentSkillDice: number
}

/**
 * Resolved Exhaustion: the durable `level` and its table-derived `description`
 * (D27). The 1–6 descriptions are placeholders until the rulebook table ships.
 */
export interface ResolvedExhaustion {
  level: number
  description: string
}
