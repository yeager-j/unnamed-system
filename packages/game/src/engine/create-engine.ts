import { buildLineageAtlas as buildLineageAtlasCore } from "@workspace/game/engine/archetypes/atlas"
import {
  archetypeSwitcherGroups as archetypeSwitcherGroupsCore,
  buildArchetypeEntries as buildArchetypeEntriesCore,
  getArchetypeDisplay as getArchetypeDisplayCore,
  previewArchetypeSkills as previewArchetypeSkillsCore,
} from "@workspace/game/engine/archetypes/utils"
import {
  deriveHydratedCharacter as deriveHydratedCharacterCore,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceCharacter as reduceCharacterCore } from "@workspace/game/engine/character/reduce-character"
import {
  buildStatContext as buildStatContextCore,
  toStatContext as toStatContextCore,
} from "@workspace/game/engine/character/stats/stat-character"
import {
  resolveTalentsForBuilder as resolveTalentsForBuilderCore,
  resolveTalentsForSheet as resolveTalentsForSheetCore,
} from "@workspace/game/engine/character/talents/display"
import {
  resolveCatalogEnemyStatblocks as resolveCatalogEnemyStatblocksCore,
  statblockFromEnemy as statblockFromEnemyCore,
} from "@workspace/game/engine/combatant/statblock"
import { reduceCombatSession as reduceCombatSessionCore } from "@workspace/game/engine/encounter/reduce-session"
import { createCombatSession as createCombatSessionCore } from "@workspace/game/engine/encounter/session-factory"
import { buildEnemyCatalogRows as buildEnemyCatalogRowsCore } from "@workspace/game/engine/enemies/catalog-rows"
import {
  addItem as addItemCore,
  equipItem as equipItemCore,
  setItemQuantity as setItemQuantityCore,
} from "@workspace/game/engine/items/utils"
import { type GameData } from "@workspace/game/engine/ports"
import { type HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import { type CombatContext } from "@workspace/game/foundation/character/state"

/**
 * Binds the pure engine's boundary functions to one {@link GameData} adapter and
 * one id generator, returning the object the imperative shell calls. The engine
 * itself stays catalog-free (UNN-354): every boundary function takes its catalog
 * lookups as an explicit port and `newId` explicitly, so this factory is the
 * single place those are supplied — `apps/web/lib/game-engine.ts` is the one
 * production binding site, and tests bind `makeTestGameData(...)` + a
 * deterministic generator.
 *
 * It is a factory closure, not a class: there is no inheritance, mutable state,
 * or lifecycle, so the codebase's pure-function ethos is preserved and
 * destructuring the result (`const { reduceCharacter } = createGameEngine(...)`)
 * stays safe — no `this` to detach. **Methods are binding only**: each delegates
 * to the existing pure `*Core` function, so the narrow per-function ports survive
 * as the finest-grained injection seam for mutation tests. No logic lives here.
 */
export function createGameEngine(
  data: GameData,
  newId: () => string = () => crypto.randomUUID()
) {
  const bindData =
    <A extends unknown[], R>(fn: (...args: [...A, GameData]) => R) =>
    (...args: A): R =>
      fn(...args, data)

  const bindDataAndNewId =
    <A extends unknown[], R>(
      fn: (...args: [...A, GameData, () => string]) => R
    ) =>
    (...args: A): R =>
      fn(...args, data, newId)

  const bindNewId =
    <A extends unknown[], R>(fn: (...args: [...A, () => string]) => R) =>
    (...args: A): R =>
      fn(...args, newId)

  return {
    deriveHydratedCharacter: (
      raw: RawCharacterInputs,
      context?: CombatContext
    ) => deriveHydratedCharacterCore(raw, data, context),
    toStatContext: bindData(toStatContextCore),
    buildStatContext: bindData(buildStatContextCore),
    reduceCharacter: bindDataAndNewId(reduceCharacterCore),
    getArchetypeDisplay: (
      character: HydratedCharacter,
      context?: CombatContext
    ) => getArchetypeDisplayCore(character, data, context),
    buildArchetypeEntries: (
      character: HydratedCharacter,
      context?: CombatContext
    ) => buildArchetypeEntriesCore(character, data, context),
    buildEnemyCatalogRows: () => buildEnemyCatalogRowsCore(data),
    resolveCatalogEnemyStatblocks: bindData(resolveCatalogEnemyStatblocksCore),
    statblockFromEnemy: bindData(statblockFromEnemyCore),
    reduceCombatSession: bindDataAndNewId(reduceCombatSessionCore),
    buildLineageAtlas: (character: HydratedCharacter) =>
      buildLineageAtlasCore(character, data.allArchetypes()),
    archetypeSwitcherGroups: bindData(archetypeSwitcherGroupsCore),
    previewArchetypeSkills: bindData(previewArchetypeSkillsCore),
    resolveTalentsForSheet: bindData(resolveTalentsForSheetCore),
    resolveTalentsForBuilder: bindData(resolveTalentsForBuilderCore),
    equipItem: bindData(equipItemCore),
    addItem: bindData(addItemCore),
    setItemQuantity: bindData(setItemQuantityCore),
    createCombatSession: bindNewId(createCombatSessionCore),
  }
}

/** The bound engine object {@link createGameEngine} returns. */
export type GameEngine = ReturnType<typeof createGameEngine>
