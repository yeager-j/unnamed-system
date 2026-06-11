import { produce } from "immer"

import {
  engagedWith,
  unlink,
} from "@workspace/game/engine/encounter/engagement-graph"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"
import type { MoveCombatantEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Placement slice (UNN-315). `moveCombatant` sets the combatant's `zoneId` to
 * `toZoneId` — the in-play travel edit, also reused to place an unplaced
 * mid-combat joiner. It does **not** validate that `toZoneId` exists in
 * `session.zones` (no referential enforcement — UNN-313 decision; the DM control
 * offers only adjacent zones) and never blocks a non-adjacent target (ADR
 * Decision 8 — the engine guides, the table decides).
 *
 * Engagement is a **same-zone** melee-lock, so moving out of a zone severs every
 * engagement with a combatant left behind, symmetrically on both sides (UNN-347;
 * rulebook 3.5). A target that happens to share the destination zone keeps its
 * link. This is the invariant half of the move — distinct from the "guide, don't
 * block" stance on the *target* zone itself.
 *
 * No-ops return the original session reference: an unknown combatant id (the
 * `find` misses) and moving to the already-occupied zone (the guard below skips
 * the mutation) both leave `produce` returning the input untouched.
 */
export function reducePlacementEvent(
  session: CombatSession,
  event: MoveCombatantEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find((c) => c.id === event.combatantId)
    if (combatant === undefined || combatant.zoneId === event.toZoneId) return
    combatant.zoneId = event.toZoneId

    const zoneById = new Map(draft.combatants.map((c) => [c.id, c.zoneId]))
    for (const targetId of engagedWith(combatant)) {
      if (zoneById.get(targetId) === event.toZoneId) continue
      unlink(combatant, targetId)
      const target = draft.combatants.find((c) => c.id === targetId)
      if (target !== undefined) unlink(target, combatant.id)
    }
  })
}
