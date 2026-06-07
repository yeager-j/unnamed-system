import { gameData } from "@workspace/game/data/game-data"
import { resolveCatalogEnemyStatblocks } from "@workspace/game/engine/combatant/statblock"
import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import type {
  CombatantSetup,
  CombatSession,
} from "@workspace/game/foundation/encounter/session"
import type { CombatEvent } from "@workspace/game/foundation/encounter/session-event"

/**
 * Encounter test helpers binding the production catalog (`gameData`) so the
 * tracker boundary's call sites stay terse — the engine itself takes its lookups
 * explicitly (UNN-354). `reduceCombat` injects the enemy lookup the
 * `adjustEnemyVitals` slice needs; `enemyStatblocks` resolves the
 * `enemyStatblockById` map the read shapers take, from a roster of combatants or
 * setups.
 */
export const reduceCombat = (
  session: CombatSession,
  event: CombatEvent,
  newId?: () => string
): CombatSession => reduceCombatSession(session, event, gameData, newId)

export const enemyStatblocks = (
  combatants: readonly { ref: CombatantSetup["ref"] }[]
) => resolveCatalogEnemyStatblocks(combatants, gameData)
