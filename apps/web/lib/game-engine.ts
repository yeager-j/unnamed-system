import { gameData } from "@workspace/game/data"
import {
  addItem as addItemCore,
  archetypeSwitcherGroups as archetypeSwitcherGroupsCore,
  buildArchetypeEntries as buildArchetypeEntriesCore,
  buildEnemyCatalogRows as buildEnemyCatalogRowsCore,
  buildLineageAtlas as buildLineageAtlasCore,
  buildStatContext as buildStatContextCore,
  deriveHydratedCharacter as deriveHydratedCharacterCore,
  equipItem as equipItemCore,
  getArchetypeDisplay as getArchetypeDisplayCore,
  previewArchetypeSkills as previewArchetypeSkillsCore,
  reduceCharacter as reduceCharacterCore,
  reduceCombatSession as reduceCombatSessionCore,
  resolveCatalogEnemyStatblocks as resolveCatalogEnemyStatblocksCore,
  resolveTalentsForBuilder as resolveTalentsForBuilderCore,
  resolveTalentsForSheet as resolveTalentsForSheetCore,
  setItemQuantity as setItemQuantityCore,
  statblockFromEnemy as statblockFromEnemyCore,
  toStatContext as toStatContextCore,
} from "@workspace/game/engine"

/**
 * The **composition root** for the pure game engine (UNN-354): the engine's
 * boundary functions take their catalog lookups as an explicit
 * {@link import("@workspace/game/engine").ArchetypeLookup port} — never a hidden
 * global — so this one module binds them once to the production
 * {@link gameData} adapter and re-exports the pre-bound versions the app calls.
 *
 * App code imports these (not the raw `@workspace/game/engine` functions) so it
 * never threads `gameData` by hand, and the catalog/demo-flag dependence stays
 * confined here. Engine tests inject `gameData` or a narrow stub directly.
 */

export const deriveHydratedCharacter = (
  raw: Parameters<typeof deriveHydratedCharacterCore>[0]
) => deriveHydratedCharacterCore(raw, gameData)

export const toStatContext = (
  character: Parameters<typeof toStatContextCore>[0]
) => toStatContextCore(character, gameData)

export const buildStatContext = (
  character: Parameters<typeof buildStatContextCore>[0],
  archetypes: Parameters<typeof buildStatContextCore>[1],
  equippedItemKeys: Parameters<typeof buildStatContextCore>[2]
) => buildStatContextCore(character, archetypes, equippedItemKeys, gameData)

export const reduceCharacter = (
  character: Parameters<typeof reduceCharacterCore>[0],
  edit: Parameters<typeof reduceCharacterCore>[1],
  newId?: Parameters<typeof reduceCharacterCore>[3]
) => reduceCharacterCore(character, edit, gameData, newId)

export const getArchetypeDisplay = (
  character: Parameters<typeof getArchetypeDisplayCore>[0]
) => getArchetypeDisplayCore(character, gameData)

export const buildArchetypeEntries = (
  character: Parameters<typeof buildArchetypeEntriesCore>[0]
) => buildArchetypeEntriesCore(character, gameData)

export const buildEnemyCatalogRows = () => buildEnemyCatalogRowsCore(gameData)

/** Resolves the `enemyStatblockById` map the encounter read shapers take, for a
 *  roster's catalog enemies. Built once per render at the (client or server)
 *  view boundary and threaded into `buildConsoleView` / `buildRosterView` /
 *  `combatantDetail` / `compareInitiative` / etc. */
export const resolveCatalogEnemyStatblocks = (
  combatants: Parameters<typeof resolveCatalogEnemyStatblocksCore>[0]
) => resolveCatalogEnemyStatblocksCore(combatants, gameData)

export const statblockFromEnemy = (
  enemy: Parameters<typeof statblockFromEnemyCore>[0]
) => statblockFromEnemyCore(enemy, gameData)

export const reduceCombatSession = (
  session: Parameters<typeof reduceCombatSessionCore>[0],
  event: Parameters<typeof reduceCombatSessionCore>[1],
  newId?: Parameters<typeof reduceCombatSessionCore>[3]
) => reduceCombatSessionCore(session, event, gameData, newId)

export const buildLineageAtlas = (
  character: Parameters<typeof buildLineageAtlasCore>[0]
) => buildLineageAtlasCore(character, gameData.allArchetypes())

export const archetypeSwitcherGroups = (
  character: Parameters<typeof archetypeSwitcherGroupsCore>[0]
) => archetypeSwitcherGroupsCore(character, gameData)

export const previewArchetypeSkills = (
  archetype: Parameters<typeof previewArchetypeSkillsCore>[0],
  pathChoice: Parameters<typeof previewArchetypeSkillsCore>[1]
) => previewArchetypeSkillsCore(archetype, pathChoice, gameData)

export const resolveTalentsForSheet = (
  gainedTalents: Parameters<typeof resolveTalentsForSheetCore>[0],
  activeArchetypeKey: Parameters<typeof resolveTalentsForSheetCore>[1]
) => resolveTalentsForSheetCore(gainedTalents, activeArchetypeKey, gameData)

export const resolveTalentsForBuilder = (
  originArchetypeKey: Parameters<typeof resolveTalentsForBuilderCore>[0]
) => resolveTalentsForBuilderCore(originArchetypeKey, gameData)

export const equipItem = (
  items: Parameters<typeof equipItemCore>[0],
  itemId: Parameters<typeof equipItemCore>[1]
) => equipItemCore(items, itemId, gameData)

export const addItem = (
  items: Parameters<typeof addItemCore>[0],
  catalogItemKey: Parameters<typeof addItemCore>[1],
  requestedQuantity: Parameters<typeof addItemCore>[2],
  newId: Parameters<typeof addItemCore>[3]
) => addItemCore(items, catalogItemKey, requestedQuantity, newId, gameData)

export const setItemQuantity = (
  items: Parameters<typeof setItemQuantityCore>[0],
  itemId: Parameters<typeof setItemQuantityCore>[1],
  quantity: Parameters<typeof setItemQuantityCore>[2]
) => setItemQuantityCore(items, itemId, quantity, gameData)
