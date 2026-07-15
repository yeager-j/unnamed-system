/**
 * A current/max pool — the shape both the HP and SP vitals bars render. The one
 * app-owned home for the display pool (UNN-583/UNN-597), shared by the character
 * rail, the combat roster + watch, and the dungeon token surfaces. It is owned
 * by **neither** `combat` nor `character`: the `vitals`/`skillPool` components
 * both features read resolve to the same pair, so the type + shapers live at the
 * domain root (like `domain/labels.ts`).
 *
 * The engine's `DungeonPool` is a structural peer this can't absorb: the engine
 * cannot depend on `apps/web`, so it keeps its own identical shape and components
 * read it structurally as a `Pool`.
 */
export interface Pool {
  current: number
  max: number
}

/** The HP pool from a resolved `vitals` component, or `null` when the entity
 *  carries none — absence, not an empty `{0,0}` pool. */
export function hpPool(
  vitals: { currentHP: number; maxHP: number } | null | undefined
): Pool | null {
  return vitals ? { current: vitals.currentHP, max: vitals.maxHP } : null
}

/** The SP pool from a resolved `skillPool` component, or `null` when the entity
 *  carries none. */
export function spPool(
  skillPool: { currentSP: number; maxSP: number } | null | undefined
): Pool | null {
  return skillPool
    ? { current: skillPool.currentSP, max: skillPool.maxSP }
    : null
}
