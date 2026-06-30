import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"

/**
 * The symmetric melee-lock graph primitives shared by every spatial slice that
 * touches engagement — `setEngagement`/`clearEngagement`, `moveCombatant`'s
 * `move → break-engagement`, and the occupancy helpers' sever. Engagement is an
 * undirected, same-zone graph (A engaged with B ⟺ B engaged with A, both
 * co-located), so every edit must mirror onto the affected partner; **the symmetry
 * lives here, in spatial, never in combat** (ADR §2.5; CD13).
 *
 * They operate on any **engagement holder** — anything carrying an {@link Engagement}
 * field — so the same invariant is enforced wherever engagement rides: the
 * Map-Instance's occupancy token ({@link import("./map-instance.schema").MapToken}).
 * Written to **mutate in place** — callers pass an Immer draft from inside a
 * `produce`. Ports v1 `engine/encounter/engagement-graph.ts` verbatim (D2), re-typed
 * on the branded {@link ParticipantId}: the v2 `Engagement` shape's
 * `targetCombatantIds` are `ParticipantId`s, so a `string[]` would not typecheck
 * into them (engagement is combat-only — exploration tokens are always Free).
 */
type EngagementHolder = { engagement: Engagement }

/** The ids a holder is currently engaged with, or `[]` when Free. */
export function engagedWith(holder: EngagementHolder): ParticipantId[] {
  return holder.engagement.status === "engaged"
    ? holder.engagement.targetCombatantIds
    : []
}

/** Re-stamps a holder's engagement from a target list — Free when empty. The single
 *  decision point for the `free`/`engaged` discriminant (never writes an empty
 *  `engaged`, which the schema's `min(1)` forbids). */
export function setEngaged(
  holder: EngagementHolder,
  targets: ParticipantId[]
): void {
  holder.engagement =
    targets.length === 0
      ? { status: "free" }
      : { status: "engaged", targetCombatantIds: targets }
}

/**
 * Removes `otherId` from a holder's engagement, reverting it to Free when that
 * was its last link. A no-op when the holder wasn't engaged with `otherId`.
 */
export function unlink(holder: EngagementHolder, otherId: ParticipantId): void {
  const current = engagedWith(holder)
  if (!current.includes(otherId)) return
  setEngaged(
    holder,
    current.filter((id) => id !== otherId)
  )
}
