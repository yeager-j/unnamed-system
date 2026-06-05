import { produce } from "immer"

import type { CombatSession } from "../session"
import type { AilmentEvent } from "../session-event"

/**
 * Ailment overlay slice (UNN-310). `setAilment` adds an ailment key to the
 * combatant; `clearAilment` removes it. Both are **permissive**: the app tracks
 * whatever the DM records and never enforces the "one non-Downed ailment at a
 * time" convention — co-existence is the DM's call at the table (mirroring the
 * permissive `ailmentsSchema`). `setAilment` is idempotent (no duplicate key);
 * `clearAilment` drops only the named key, leaving the rest. Downed set here
 * drives the rail badge + draft-skip and is cleared at the start of the
 * combatant's next turn by `draftCombatant`. A no-op when the combatant id is
 * unknown (Immer returns the original session). Mirrors `reduce/conditions.ts`.
 */
export function reduceAilmentEvent(
  session: CombatSession,
  event: AilmentEvent
): CombatSession {
  return produce(session, (draft) => {
    const combatant = draft.combatants.find(
      (entry) => entry.id === event.combatantId
    )
    if (combatant === undefined) return

    switch (event.kind) {
      case "setAilment":
        if (!combatant.ailments.includes(event.ailment)) {
          combatant.ailments.push(event.ailment)
        }
        return
      case "clearAilment":
        combatant.ailments = combatant.ailments.filter(
          (ailment) => ailment !== event.ailment
        )
        return
    }
  })
}
