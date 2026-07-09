import { gameData } from "@workspace/game/data"
import { createGameEngine } from "@workspace/game/engine"

/**
 * The v1 **enemy-bestiary binding** — the last apps/web consumer of the v1
 * `@workspace/game` engine after Characters v2 S4 (UNN-562). Character
 * derivation, the optimistic reducer, and every archetype / atlas / talent /
 * inventory helper moved to `@/lib/game-engine-v2` across the S1–S3 cutover;
 * the v1 combat-session and spatial exports retired with UNN-535 / UNN-540.
 *
 * What remains is the bestiary **browse** (the DM "pick an enemy" catalog +
 * statblock card), which still renders v1 display data — key-parity with the v2
 * catalog is exact; the commit path is fully v2. Migrating the browse to v2 and
 * deleting this module ride the follow-up (retire the v1 display layer + delete
 * `packages/game`).
 */
export const { buildEnemyCatalogRows, statblockFromEnemy } =
  createGameEngine(gameData)
