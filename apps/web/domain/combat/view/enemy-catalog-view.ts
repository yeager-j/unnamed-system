import { getEnemy, getEnemyFamily } from "@workspace/game-v2/catalog/enemies"

import { resolveEntity } from "@/domain/game-engine-v2"

import {
  enemyStatblockView,
  type EnemyStatblockView,
} from "./enemy-statblock-view"

/**
 * The app-side seam for the bestiary browse surface: the catalog-row shapers and
 * family vocab re-exported so `components/**` sources them from `@/lib/**`, plus
 * the selected-enemy → statblock projection folded here (out of the panel). The
 * engine's `catalog-rows` shaping is honest display data; this module is the one
 * import boundary a future engine move would touch (UNN-583).
 */
export {
  ENEMY_FAMILIES,
  type EnemyFamily,
} from "@workspace/game-v2/catalog/enemies"
export {
  buildEnemyCatalogRows,
  enemyFamilyCounts,
  filterEnemyCatalogRows,
  groupEnemyRowsByLevel,
} from "@workspace/game-v2/catalog/enemies/catalog-rows"
export type {
  EnemyCatalogLevelGroup,
  EnemyCatalogRow,
} from "@workspace/game-v2/catalog/enemies/catalog-rows"

/** The catalog enemy's display name, or the key itself when it names none. */
export function enemyDisplayName(key: string): string {
  return getEnemy(key)?.components.identity?.name ?? key
}

/** Resolves a catalog enemy by key and projects it onto the statblock view the
 *  browse card renders, or `null` when the key names no catalog enemy. */
export function selectedEnemyStatblock(key: string): EnemyStatblockView | null {
  const entity = getEnemy(key)
  if (entity === undefined) return null
  return enemyStatblockView(
    entity,
    resolveEntity(entity),
    getEnemyFamily(key) ?? null
  )
}
