import { gameData } from "@workspace/game-v2/catalog"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { createResolve } from "@workspace/game-v2/progression/resolve"

/**
 * The **composition root** (D33, the `createGameEngine` equivalent): the one place
 * that binds the concrete {@link gameData} catalog adapter into the engine's
 * pure, port-shaped functions. Engine logic stays catalog-agnostic (it declares
 * `Pick<GameData, ...>` slices); this seam wires the real adapter once, so app
 * code imports pre-bound functions and never the catalog.
 *
 * It is one of two files (with `catalog/index.ts`) allowed to name a `catalog`
 * import directly. PR2 (UNN-500) binds the base-layer `resolve`; each domain PR
 * binds its functions here.
 */
export function createGameEngine(deps: GameData = gameData) {
  return {
    resolve: createResolve(deps),
  }
}

export type GameEngine = ReturnType<typeof createGameEngine>
