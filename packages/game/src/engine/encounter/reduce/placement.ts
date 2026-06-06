import { produce } from "immer"

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
 * No-ops return the original session reference: an unknown combatant id (the
 * `find` misses) and moving to the already-occupied zone (assigning the same
 * value leaves the Immer draft unchanged) both leave `produce` returning the
 * input untouched.
 */
export function reducePlacementEvent(
  session: CombatSession,
  event: MoveCombatantEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find((c) => c.id === event.combatantId)
    if (combatant === undefined) return
    combatant.zoneId = event.toZoneId
  })
}
