import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { resolveCatalogEnemyStatblocks } from "@workspace/game/engine/combatant/statblock"
import { reduceMapInstance } from "@workspace/game/engine/encounter/reduce-map-instance"
import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import {
  createCombatSession,
  createMapInstance,
} from "@workspace/game/engine/encounter/session-factory"
import { type GameData } from "@workspace/game/engine/ports"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type { MapInstanceEvent } from "@workspace/game/foundation/encounter/map-instance-event"
import type {
  CombatantSetup,
  CombatSession,
} from "@workspace/game/foundation/encounter/session"
import type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Encounter test helpers that take the engine's catalog lookups explicitly
 * (UNN-354), defaulting to an **empty** {@link makeTestGameData} so a test is
 * fixture-backed by default and never silently reaches the real catalog
 * (UNN-360/UNN-363). `reduceCombat` injects the enemy lookup the
 * `adjustEnemyVitals` slice needs; `enemyStatblocks` resolves the
 * `enemyStatblockById` map the read shapers take, from a roster of combatants or
 * setups.
 *
 * Tests built from PCs + inline enemies (which carry their own statblock/vitals)
 * never consult the catalog, so the empty default leaves them untouched. A test
 * that asserts a `catalog-enemy` ref's *resolved* statblock seeds the enemy via
 * `makeTestGameData({ enemies: [makeEnemy({...})], skills: [...] })` and passes
 * it through `data`. Real-catalog resolution lives in `__contract__`.
 */
const EMPTY_CATALOG = makeTestGameData()

export const reduceCombat = (
  session: CombatSession,
  event: CombatEvent,
  newId: () => string = () => crypto.randomUUID(),
  data: GameData = EMPTY_CATALOG
): CombatSession => reduceCombatSession(data, newId)(session, event)

export const enemyStatblocks = (
  combatants: readonly { ref: CombatantSetup["ref"] }[],
  data: GameData = EMPTY_CATALOG
) => resolveCatalogEnemyStatblocks(data)(combatants)

/**
 * A {@link MapInstanceState} for the `reduceMapInstance` slice tests (UNN-454).
 * Every slice defaults empty (no zones/occupancy/enchantment); a test seeds only
 * the spatial state its transition reads — built from fixtures, never balance
 * numbers. Cloned per call so a mutation in one test can't leak into another.
 */
export const makeMapInstanceState = (
  overrides: Partial<MapInstanceState> = {}
): MapInstanceState => ({
  zones: {},
  adjacency: {},
  occupancy: {},
  enchantment: null,
  ...overrides,
})

/** Applies one {@link MapInstanceEvent}; `newId` defaults to a stable counter so
 *  an `addZone` without an id is deterministic. */
export const reduceInstance = (
  state: MapInstanceState,
  event: MapInstanceEvent,
  newId: () => string = sequentialZoneIds()
): MapInstanceState => reduceMapInstance(newId)(state, event)

function sequentialZoneIds() {
  let n = 0
  return () => `zone-${n++}`
}

/**
 * Co-mints the {@link CombatSession} + its {@link MapInstanceState} from one
 * roster, the way the impure shell does post-cutover (UNN-459) — the spatial
 * state (zoneId/engagement) lives on the Instance occupancy, the rest on the
 * session. Each setup's id is resolved deterministically (`c-0`, `c-1`, … unless
 * supplied) so occupancy keys and session combatant ids agree. `instanceOverrides`
 * layers the test's geometry/enchantment on top (zones/adjacency/enchantment),
 * leaving the roster-derived occupancy intact. The shaper-collaboration peer of
 * `reduceCombat`/`reduceInstance`.
 */
export const makeEncounter = (
  roster: CombatantSetup[],
  instanceOverrides: Partial<MapInstanceState> = {}
): { session: CombatSession; instance: MapInstanceState } => {
  const withIds = roster.map((setup, index) => ({
    ...setup,
    id: setup.id ?? `c-${index}`,
  }))
  const idsResolved = () => {
    throw new Error("makeEncounter: setup ids are resolved up front")
  }
  return {
    session: createCombatSession(idsResolved)(withIds),
    instance: {
      ...createMapInstance(idsResolved)(withIds),
      ...instanceOverrides,
    },
  }
}
