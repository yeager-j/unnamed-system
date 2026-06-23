/**
 * The **resolved** vitals read-units `resolve` emits (D30) — derived values only,
 * never the authored `damage`/`spSpent` (F3). PR2 emits the maxima; PR3 (UNN-501)
 * extends these with `currentHP`/`currentSP` once depletion lands.
 */

/** Resolved HP capability. PR3 adds `currentHP`. */
export interface ResolvedVitals {
  maxHP: number
}

/** Resolved SP capability. PR3 adds `currentSP`. */
export interface ResolvedSkillPool {
  maxSP: number
}
