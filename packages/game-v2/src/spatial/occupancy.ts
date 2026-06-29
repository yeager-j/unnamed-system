import { produce } from "immer"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { setEngaged, unlink } from "./engagement-graph"
import type { MapInstanceState, MapToken } from "./map-instance.schema"

/**
 * Occupancy primitives — the cross-row write-obligations the combat composition
 * **names but never performs** (ADR §2.5; CD16 / R23). Adding or removing a combatant
 * touches **two** rows — the Encounter roster slot (via the session reducer) and the
 * Map-Instance token (here) — so these are deliberately **not** `MapInstanceEvent`s
 * that travel through `reduceMapInstance`'s wire vocabulary; the composition shell
 * calls them as pure helpers inside one transaction alongside the session reduce (PR3).
 * Ports v1 `engine/encounter/occupancy.ts` verbatim (D2).
 *
 * The `tokenKey` stays an **opaque string** (dual-lifecycle: a `ParticipantId` in
 * combat, a `characterId` in exploration, SD5) — the brand to {@link asParticipantId}
 * happens only where a key enters an engagement list (the `unlink` sever), since
 * engagement is combat-only. Each returns a new Immer-drafted state, leaving the input
 * untouched, matching `reduceMapInstance`'s conventions.
 */

/** Places (or replaces) a combatant's occupancy token, keyed by `tokenKey`. */
export function addOccupant(
  state: MapInstanceState,
  tokenKey: string,
  token: MapToken
): MapInstanceState {
  return produce(state, (draft) => {
    draft.occupancy[tokenKey] = token
  })
}

/**
 * Drops a combatant's token and severs every survivor's engagement to it (R23.2) —
 * the relocation of v1's `removeCombatant` unlink loop onto the Instance, now that
 * engagement rides the token. Engagement is symmetric, so a one-sided dangling
 * melee-lock can't remain.
 */
export function removeOccupant(
  state: MapInstanceState,
  tokenKey: string
): MapInstanceState {
  return produce(state, (draft) => {
    delete draft.occupancy[tokenKey]
    for (const token of Object.values(draft.occupancy)) {
      unlink(token, asParticipantId(tokenKey))
    }
  })
}

/**
 * Combat-end cleanup (ADR §2.6/SD9): drops the given tokens (the fight's enemies),
 * frees every survivor's engagement, and clears the Zone Enchantment — the "one
 * cleanup, one row" the lifecycle asymmetry calls for. Engagement and enchantment are
 * combat-scoped (*"All Enchantments end when combat ends,"* rulebook), so the Instance
 * returns to its empty-in-exploration profile; the surviving (PC) tokens keep their
 * `zoneId`, so the party persists exactly where the fight ended.
 *
 * Composed by the shell's combat-end transaction (alongside the Encounter status flip
 * + the Dungeon turn advance, PR3), not a {@link MapInstanceState} event — the same
 * reasoning as {@link addOccupant}/{@link removeOccupant}.
 */
export function pruneCombat(
  state: MapInstanceState,
  tokenKeys: string[]
): MapInstanceState {
  return produce(state, (draft) => {
    for (const key of tokenKeys) {
      delete draft.occupancy[key]
    }
    for (const token of Object.values(draft.occupancy)) {
      setEngaged(token, [])
    }
    draft.enchantment = null
  })
}
