import { produce } from "immer"

import {
  setEngaged,
  unlink,
} from "@workspace/game/engine/encounter/engagement-graph"
import type {
  MapInstanceState,
  MapToken,
} from "@workspace/game/foundation/encounter/map-instance"

/**
 * Occupancy primitives for the cross-container roster gestures the impure shell
 * composes in a {@link import("@/lib/db/writes/guard-many").guardMany}
 * transaction (ADR — *Atomicity*): adding or removing a combatant touches **two**
 * rows — the Encounter roster slot (via `reduceCombatSession`) and the Map
 * Instance token (here). They are deliberately **not** `MapInstanceEvent`s: an
 * `addCombatant`/`removeCombatant` is a session-roster event the spatial layer
 * only mirrors, so it never travels through `reduceMapInstance`'s wire vocabulary
 * — the shell calls these pure helpers alongside the session reduce instead.
 *
 * Both return a new state (Immer-drafted), leaving the input untouched, matching
 * `reduceMapInstance`'s conventions.
 */

/** Places (or replaces) a combatant's occupancy token, keyed by combatant id. */
export function addOccupant(
  state: MapInstanceState,
  combatantId: string,
  token: MapToken
): MapInstanceState {
  return produce(state, (draft) => {
    draft.occupancy[combatantId] = token
  })
}

/**
 * Drops a combatant's token and severs every survivor's engagement to it — the
 * relocation of the old `reduce/round.ts` `removeCombatant` unlink loop onto the
 * Instance, now that engagement rides the token instead of the session combatant.
 * Engagement is symmetric, so a one-sided dangling melee-lock can't remain.
 */
export function removeOccupant(
  state: MapInstanceState,
  combatantId: string
): MapInstanceState {
  return produce(state, (draft) => {
    delete draft.occupancy[combatantId]
    for (const token of Object.values(draft.occupancy)) {
      unlink(token, combatantId)
    }
  })
}

/**
 * Combat-end cleanup (UNN-469): drops the given tokens (the fight's enemies),
 * frees every survivor's engagement, and clears the Zone Enchantment — the "one
 * cleanup, one row" the ADR (*Lifecycle: empty in exploration, pruned at
 * combat-end*) calls for. Engagement and enchantment are combat-scoped, so the
 * Instance returns to its empty-in-exploration profile; the surviving (PC) tokens
 * keep their `zoneId`, so the party persists exactly where the fight ended.
 *
 * Composed by the impure shell's combat-end `guardMany` (alongside the Encounter
 * status flip + the Dungeon turn advance), not a {@link
 * import("@workspace/game/foundation").MapInstanceEvent} — the same reasoning as
 * {@link addOccupant}/{@link removeOccupant}.
 */
export function pruneCombat(
  state: MapInstanceState,
  removeCombatantIds: string[]
): MapInstanceState {
  return produce(state, (draft) => {
    for (const id of removeCombatantIds) {
      delete draft.occupancy[id]
    }
    for (const token of Object.values(draft.occupancy)) {
      setEngaged(token, [])
    }
    draft.enchantment = null
  })
}
