import {
  BATTLE_CONDITION_AXIS_KEYS,
  type BattleConditionAxisKey,
  type BattleConditions,
} from "@workspace/game/character"
import type {
  EncounterSnapshot,
  PlayerVisibleCombatant,
} from "@workspace/game/engine/encounter/player-snapshot"
import type { Zone } from "@workspace/game/foundation/encounter/session"

/**
 * Presentation shaping for the player watch view (UNN-322) — the read-only peer
 * of the rail's resolve helpers. Turns the redacted {@link EncounterSnapshot}
 * into render-ready groups so the watch components run no `.filter().map()` of
 * their own (CLAUDE.md convention). Pure and label-free: it returns structured
 * condition tokens (axis/state/flag), and the component maps them to the
 * `BATTLE_CONDITION_*` labels — the game layer never holds display strings.
 */

/**
 * One zone with the combatants standing in it, for the zone map. Mirrors the DM
 * battlefield's grouping ({@link import("./resolve-zone-layout").ZoneLayoutView})
 * but over the redacted snapshot — no PC details reach the client.
 */
export interface PlayerZoneGroup {
  zone: Zone
  combatants: PlayerVisibleCombatant[]
}

/** The shaped watch view: the zone groups (in zone order), the `unplaced`
 *  overflow (combatants whose `zoneId` matches no current zone), and `hasZones`
 *  so the component shows a flat roster instead of an empty map. */
export interface PlayerView {
  zones: PlayerZoneGroup[]
  unplaced: PlayerVisibleCombatant[]
  hasZones: boolean
}

/** One active Battle Condition for the badge row: a non-neutral tri-state axis,
 *  or a set single-use flag. Structured, not labelled — the component supplies
 *  the human-readable text and tone. */
export type ActiveCondition =
  | {
      kind: "axis"
      axis: BattleConditionAxisKey
      state: "increased" | "decreased"
    }
  | { kind: "flag"; flag: "charged" | "concentrating" }

/**
 * The active Battle Conditions on a combatant: every non-`neutral` axis plus
 * each set flag (Charged / Concentrating). Neutral axes and unset flags are
 * dropped — the watch view only renders what is actually in effect.
 */
export function activeConditions(
  conditions: BattleConditions
): ActiveCondition[] {
  const axes = BATTLE_CONDITION_AXIS_KEYS.flatMap((axis) => {
    const state = conditions[axis]
    return state === "neutral" ? [] : [{ kind: "axis" as const, axis, state }]
  })

  const flags = (["charged", "concentrating"] as const).flatMap((flag) =>
    conditions[flag] ? [{ kind: "flag" as const, flag }] : []
  )

  return [...axes, ...flags]
}

/**
 * Groups the snapshot's combatants under the zone their `zoneId` references (in
 * `snapshot.zones` order), bucketing any whose `zoneId` matches no current zone
 * into `unplaced`. Pure — recomputed on every poll so a move re-lays the map
 * with no extra state.
 */
export function resolvePlayerView(snapshot: EncounterSnapshot): PlayerView {
  const zoneIds = new Set(snapshot.zones.map((zone) => zone.id))

  const zones = snapshot.zones.map((zone) => ({
    zone,
    combatants: snapshot.combatants.filter(
      (combatant) => combatant.zoneId === zone.id
    ),
  }))

  const unplaced = snapshot.combatants.filter(
    (combatant) => !zoneIds.has(combatant.zoneId)
  )

  return { zones, unplaced, hasZones: snapshot.zones.length > 0 }
}
