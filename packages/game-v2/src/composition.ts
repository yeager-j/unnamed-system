import { gameData } from "@workspace/game-v2/catalog"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The **composition root** (D33, the `createGameEngine` equivalent): the one place
 * that binds the concrete {@link gameData} catalog adapter into the engine's
 * pure, port-shaped functions. Engine logic stays catalog-agnostic (it declares
 * `Pick<GameData, ...>` slices); this seam wires the real adapter once, so app
 * code imports pre-bound functions and never the catalog.
 *
 * It is one of two files (with `catalog/index.ts`) allowed to name a `catalog`
 * import directly. PR1 ships the seam: it takes the deps and, until domain logic
 * lands, returns an empty engine. Each domain PR binds its functions here.
 */
export function createGameEngine(deps: GameData = gameData) {
  // Domains bind their port-shaped functions against `deps` as they land.
  void deps
  return {}
}

export type GameEngine = ReturnType<typeof createGameEngine>
