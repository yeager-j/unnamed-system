import { produce } from "immer"

import type { Combatant, CombatSession } from "../session"
import type { EngagementEvent } from "../session-event"

/** The ids a combatant is currently engaged with, or `[]` when Free. */
function engagedWith(combatant: Combatant): string[] {
  return combatant.engagement.status === "engaged"
    ? combatant.engagement.targetCombatantIds
    : []
}

/** Re-stamps a combatant's engagement from a target list — Free when empty. */
function setEngaged(combatant: Combatant, targets: string[]): void {
  combatant.engagement =
    targets.length === 0
      ? { status: "free" }
      : { status: "engaged", targetCombatantIds: targets }
}

/**
 * Engagement slice (UNN-316) — the live-combat counterpart of UNN-301's setup
 * `setEngagementTargets`. Engagement is **symmetric** (A engaged with B ⟺ B
 * engaged with A), so every edit is mirrored onto the affected partners:
 *
 * - `setEngagement` replaces the combatant's targets, then for each *added*
 *   target adds the combatant to its list and for each *dropped* target removes
 *   it (reverting that partner to Free when it has no other links).
 * - `clearEngagement` frees the combatant and removes it from each partner.
 *
 * No-ops return the original session reference: an unknown combatant id (the
 * `find` misses) and clearing an already-Free combatant (an early return before
 * any draft mutation). Target ids are **not** validated (313/315 philosophy);
 * the engine guides via the DM control's same-zone candidate list, never blocks.
 */
export function reduceEngagementEvent(
  session: CombatSession,
  event: EngagementEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find((c) => c.id === event.combatantId)
    if (combatant === undefined) return

    if (event.kind === "clearEngagement") {
      if (combatant.engagement.status === "free") return
      setEngaged(combatant, [])
      for (const other of draft.combatants) {
        if (engagedWith(other).includes(event.combatantId)) {
          setEngaged(
            other,
            engagedWith(other).filter((id) => id !== event.combatantId)
          )
        }
      }
      return
    }

    const next = new Set(event.targetCombatantIds)
    const prev = new Set(engagedWith(combatant))
    setEngaged(combatant, event.targetCombatantIds)

    for (const other of draft.combatants) {
      if (other.id === combatant.id) continue
      const isTarget = next.has(other.id)
      if (isTarget === prev.has(other.id)) continue
      setEngaged(
        other,
        isTarget
          ? [...new Set([...engagedWith(other), combatant.id])]
          : engagedWith(other).filter((id) => id !== combatant.id)
      )
    }
  })
}
