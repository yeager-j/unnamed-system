import { produce } from "immer"

import { unlink } from "@workspace/game/engine/encounter/engagement-graph"
import { makeCombatant } from "@workspace/game/engine/encounter/session-factory"
import { type CombatSession } from "@workspace/game/foundation/encounter/session"
import type { RoundEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Round-lifecycle + roster slice. `advanceRound` rolls to the next round:
 * increment `round`, clear `currentActorId`, and reset every combatant's
 * `hasActedThisRound` — always producing a new session, even when no flag was
 * set (the idempotent round-end safeguard). `addCombatant` appends a fresh
 * combatant (see {@link makeCombatant}) with `hasActedThisRound = true`, so a
 * mid-round joiner is queued for the next round rather than acting this one; its
 * stable id is the supplied `setup.id` (the setup surface mints it client-side so
 * the optimistic id matches the persisted one — UNN-347), falling back to `newId`
 * for the mid-combat join. `removeCombatant` drops the matching combatant, clears
 * `currentActorId` if it was the one removed, and prunes the removed id from every
 * surviving combatant's engagement so no dangling melee-lock remains (UNN-347). It
 * is a no-op when the id is unknown — Immer returns the original session.
 * `setSide` flips a combatant's side (a no-op on an unknown id). `newId` mints the
 * joiner's stable id (mirrors `reduceCharacter`'s injectable; the other cases
 * don't need it).
 */
export function reduceRoundEvent(
  session: CombatSession,
  event: RoundEvent,
  newId: () => string
): CombatSession {
  switch (event.kind) {
    case "advanceRound":
      return produce(session, (draft) => {
        draft.round += 1
        draft.currentActorId = null
        for (const combatant of draft.combatants) {
          combatant.hasActedThisRound = false
        }
      })

    case "addCombatant":
      return produce(session, (draft) => {
        draft.combatants.push(
          makeCombatant(event.setup, event.setup.id ?? newId(), true)
        )
      })

    case "removeCombatant":
      return produce(session, (draft) => {
        const index = draft.combatants.findIndex(
          (combatant) => combatant.id === event.combatantId
        )
        if (index === -1) return
        draft.combatants.splice(index, 1)
        if (draft.currentActorId === event.combatantId) {
          draft.currentActorId = null
        }
        for (const combatant of draft.combatants) {
          unlink(combatant, event.combatantId)
        }
      })

    case "setSide":
      return produce(session, (draft) => {
        const combatant = draft.combatants.find(
          (entry) => entry.id === event.combatantId
        )
        if (combatant === undefined) return
        combatant.side = event.side
      })
  }
}
