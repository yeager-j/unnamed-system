import { gameData } from "@workspace/game/data"
import {
  reduceCharacter as bindReduceCharacter,
  createGameEngine,
} from "@workspace/game/engine"

import { deriveHydratedCharacterV2 } from "@/lib/game-engine-v2"

/**
 * The **composition root** for the pure game engine (UNN-354/UNN-356): the
 * engine's boundary functions are curried deps-first, each taking the exact
 * slice of {@link import("@workspace/game/engine").GameData} it reads (and
 * `newId` explicitly) — never a hidden global — so {@link createGameEngine}
 * binds them once to the production {@link gameData} adapter (and the default
 * id generator) and this module re-exports the pre-bound versions the app calls.
 *
 * App code imports these (not the raw `@workspace/game/engine` functions) so it
 * never threads `gameData` or `newId` by hand, and the catalog/demo-flag
 * dependence stays confined here. Engine tests bind `makeTestGameData(...)` or a
 * narrow stub directly.
 */
export const {
  toStatContext,
  buildStatContext,
  getArchetypeDisplay,
  buildArchetypeEntries,
  buildEnemyCatalogRows,
  resolveCatalogEnemyStatblocks,
  statblockFromEnemy,
  reduceCombatSession,
  reduceMapInstance,
  endOfTurnObligations,
  buildLineageAtlas,
  getAtlasRecommendations,
  archetypeSwitcherGroups,
  previewArchetypeSkills,
  resolveTalentsForSheet,
  resolveTalentsForBuilder,
  equipItem,
  addItem,
  setItemQuantity,
  createCombatSession,
  createMapInstance,
} = createGameEngine(gameData)

/**
 * **THE FLIP (UNN-533, PR11a):** character derivation runs on engine v2 — the
 * `game-engine-v2.ts` seam's `deriveHydratedCharacterV2` replaces v1's derive
 * for every consumer at once (server loader, client optimistic reducer, the v1
 * tracker, `statblockFromCharacter`), and the optimistic `reduceCharacter` is
 * bound to the same derivation so a client frame can never drift from the
 * server's. Parity is gated by `lib/__tests__/derive-parity.test.ts` (seed
 * roster, real catalogs) and the golden master's full-projection suite.
 * Rollback: revert this module to destructure `deriveHydratedCharacter` and
 * `reduceCharacter` off `createGameEngine(gameData)` again.
 */
export const deriveHydratedCharacter = deriveHydratedCharacterV2
export const reduceCharacter = bindReduceCharacter(
  gameData,
  () => crypto.randomUUID(),
  deriveHydratedCharacterV2
)
