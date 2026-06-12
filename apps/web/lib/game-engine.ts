import { gameData } from "@workspace/game/data"
import { createGameEngine } from "@workspace/game/engine"

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
  deriveHydratedCharacter,
  toStatContext,
  buildStatContext,
  reduceCharacter,
  getArchetypeDisplay,
  buildArchetypeEntries,
  buildEnemyCatalogRows,
  resolveCatalogEnemyStatblocks,
  statblockFromEnemy,
  reduceCombatSession,
  endOfTurnObligations,
  buildLineageAtlas,
  archetypeSwitcherGroups,
  previewArchetypeSkills,
  resolveTalentsForSheet,
  resolveTalentsForBuilder,
  equipItem,
  addItem,
  setItemQuantity,
  createCombatSession,
} = createGameEngine(gameData)
