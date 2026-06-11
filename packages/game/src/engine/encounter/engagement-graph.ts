import type { Combatant } from "@workspace/game/foundation/encounter/session"

/**
 * The symmetric melee-lock graph primitives shared by the live-combat reducer
 * slices that touch engagement — `setEngagement`/`clearEngagement` (UNN-316),
 * `removeCombatant`, and `moveCombatant` (UNN-347). Engagement is an undirected,
 * same-zone graph (A engaged with B ⟺ B engaged with A, both co-located), so
 * every edit must mirror onto the affected partners; keeping the read/write/sever
 * primitives in one module is the live counterpart of `setup-roster-view.ts`'s
 * `normalizeEngagements`, which enforces the same invariant on the setup roster.
 *
 * The functions accept a {@link Combatant} but are written to mutate it in place —
 * callers pass an Immer `Draft<Combatant>` from inside a `produce`.
 */

/** The ids a combatant is currently engaged with, or `[]` when Free. */
export function engagedWith(combatant: Combatant): string[] {
  return combatant.engagement.status === "engaged"
    ? combatant.engagement.targetCombatantIds
    : []
}

/** Re-stamps a combatant's engagement from a target list — Free when empty. */
export function setEngaged(combatant: Combatant, targets: string[]): void {
  combatant.engagement =
    targets.length === 0
      ? { status: "free" }
      : { status: "engaged", targetCombatantIds: targets }
}

/**
 * Removes `otherId` from a combatant's engagement, reverting it to Free when that
 * was its last link. A no-op when the combatant wasn't engaged with `otherId`.
 */
export function unlink(combatant: Combatant, otherId: string): void {
  const current = engagedWith(combatant)
  if (!current.includes(otherId)) return
  setEngaged(
    combatant,
    current.filter((id) => id !== otherId)
  )
}
