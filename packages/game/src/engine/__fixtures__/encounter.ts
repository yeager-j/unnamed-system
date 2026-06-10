import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { resolveCatalogEnemyStatblocks } from "@workspace/game/engine/combatant/statblock"
import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import { type GameData } from "@workspace/game/engine/ports"
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
