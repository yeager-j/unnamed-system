import { gameData } from "@workspace/game/data"
import {
  buildArchetypeEntries as buildArchetypeEntriesCore,
  buildEnemyCatalogRows as buildEnemyCatalogRowsCore,
  buildStatContext as buildStatContextCore,
  deriveHydratedCharacter as deriveHydratedCharacterCore,
  getArchetypeDisplay as getArchetypeDisplayCore,
  reduceCharacter as reduceCharacterCore,
  reduceCombatSession as reduceCombatSessionCore,
  resolveCatalogEnemyStatblocks as resolveCatalogEnemyStatblocksCore,
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
