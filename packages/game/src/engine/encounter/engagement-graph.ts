import type { Engagement } from "@workspace/game/foundation/combat/engagement"

/**
 * The symmetric melee-lock graph primitives shared by the live-combat reducer
 * slices that touch engagement — `setEngagement`/`clearEngagement` (UNN-316),
 * `removeCombatant`, and `moveCombatant` (UNN-347). Engagement is an undirected,
 * same-zone graph (A engaged with B ⟺ B engaged with A, both co-located), so
 * every edit must mirror onto the affected partners; keeping the read/write/sever
 * primitives in one module is the live counterpart of `setup-roster-view.ts`'s
 * `normalizeEngagements`, which enforces the same invariant on the setup roster.
 *
 * They operate on any **engagement holder** — anything carrying an
 * {@link Engagement} field — so the same invariant is enforced for the session's
 * combatant (where engagement rides the `Combatant`) and the Map Instance's token
 * (`MapToken`, where it rides occupancy, UNN-454). Written to mutate in place —
 * callers pass an Immer draft from inside a `produce`.
 */
type EngagementHolder = { engagement: Engagement }

/** The ids a holder is currently engaged with, or `[]` when Free. */
export function engagedWith(holder: EngagementHolder): string[] {
  return holder.engagement.status === "engaged"
    ? holder.engagement.targetCombatantIds
    : []
}

/** Re-stamps a holder's engagement from a target list — Free when empty. */
export function setEngaged(holder: EngagementHolder, targets: string[]): void {
  holder.engagement =
    targets.length === 0
      ? { status: "free" }
      : { status: "engaged", targetCombatantIds: targets }
}

/**
 * Removes `otherId` from a holder's engagement, reverting it to Free when that
 * was its last link. A no-op when the holder wasn't engaged with `otherId`.
 */
export function unlink(holder: EngagementHolder, otherId: string): void {
  const current = engagedWith(holder)
  if (!current.includes(otherId)) return
  setEngaged(
    holder,
    current.filter((id) => id !== otherId)
  )
}
