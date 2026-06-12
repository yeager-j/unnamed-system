import { buildLineageAtlas } from "@workspace/game/engine/archetypes/atlas"
import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  getArchetypeDisplay,
  previewArchetypeSkills,
} from "@workspace/game/engine/archetypes/utils"
import { deriveHydratedCharacter } from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceCharacter } from "@workspace/game/engine/character/reduce-character"
import {
  buildStatContext,
  toStatContext,
} from "@workspace/game/engine/character/stats/stat-character"
import {
  resolveTalentsForBuilder,
  resolveTalentsForSheet,
} from "@workspace/game/engine/character/talents/display"
import {
  resolveCatalogEnemyStatblocks,
  statblockFromEnemy,
} from "@workspace/game/engine/combatant/statblock"
import { endOfTurnObligations } from "@workspace/game/engine/encounter/end-of-turn"
import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { buildEnemyCatalogRows } from "@workspace/game/engine/enemies/catalog-rows"
import {
  addItem,
  equipItem,
  setItemQuantity,
} from "@workspace/game/engine/items/utils"
import { type GameData } from "@workspace/game/engine/ports"

/**
 * Binds the pure engine's boundary functions to one {@link GameData} adapter and
 * one id generator, returning the object the imperative shell calls. The engine
 * itself stays catalog-free (UNN-354): every boundary function is curried
 * **deps-first** — an outer call taking the exact `Pick<GameData, ...>` slice it
 * reads (plus `newId` where it mints ids), returning the runtime function — so
 * this factory is one uniform sweep of outer calls and no logic lives here.
 * `apps/web/lib/game-engine.ts` is the one production binding site; tests bind
 * `makeTestGameData(...)` + a deterministic generator, or call an outer function
 * directly with a narrower stub.
 *
 * It is a factory closure, not a class: there is no inheritance, mutable state,
 * or lifecycle, so the codebase's pure-function ethos is preserved and
 * destructuring the result (`const { reduceCharacter } = createGameEngine(...)`)
 * stays safe — no `this` to detach.
 */
export function createGameEngine(
  data: GameData,
  newId: () => string = () => crypto.randomUUID()
) {
  return {
    deriveHydratedCharacter: deriveHydratedCharacter(data),
    toStatContext: toStatContext(data),
    buildStatContext: buildStatContext(data),
    reduceCharacter: reduceCharacter(data, newId),
    getArchetypeDisplay: getArchetypeDisplay(data),
    buildArchetypeEntries: buildArchetypeEntries(data),
    buildEnemyCatalogRows: buildEnemyCatalogRows(data),
    resolveCatalogEnemyStatblocks: resolveCatalogEnemyStatblocks(data),
    statblockFromEnemy: statblockFromEnemy(data),
    reduceCombatSession: reduceCombatSession(data, newId),
    endOfTurnObligations: endOfTurnObligations(data),
    buildLineageAtlas: buildLineageAtlas(data),
    archetypeSwitcherGroups: archetypeSwitcherGroups(data),
    previewArchetypeSkills: previewArchetypeSkills(data),
    resolveTalentsForSheet: resolveTalentsForSheet(data),
    resolveTalentsForBuilder: resolveTalentsForBuilder(data),
    equipItem: equipItem(data),
    addItem: addItem(data),
    setItemQuantity: setItemQuantity(data),
    createCombatSession: createCombatSession(newId),
  }
}

/** The bound engine object {@link createGameEngine} returns. */
export type GameEngine = ReturnType<typeof createGameEngine>
