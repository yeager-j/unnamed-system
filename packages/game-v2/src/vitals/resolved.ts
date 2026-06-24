/**
 * The **resolved** vitals read-units `resolve` emits (D30) — derived values only,
 * never the authored `damage`/`spSpent` (F3). `resolve` folds the maxima through
 * every layer, then derives `currentHP`/`currentSP` against the *final* maxima and
 * the authored depletion (the two-phase fold — D9 form-swap continuity).
 */

/**
 * Resolved HP capability: the honest ceiling (`maxHP`, %-of-max / threshold rules
 * read this) and the derived `currentHP = max(0, maxHP − damage)`. `currentHP` may
 * exceed `maxHP` when `damage` is negative (Usury's over-max loan). "Fallen" is the
 * {@link isFallen} predicate over this unit, not a stored field.
 */
export interface ResolvedVitals {
  maxHP: number
  currentHP: number
}

/** Resolved SP capability: `maxSP` and the derived `currentSP = max(0, maxSP − spSpent)`. */
export interface ResolvedSkillPool {
  maxSP: number
  currentSP: number
}
