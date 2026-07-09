"use client"

import {
  addEntry,
  removeEntry,
  setEntryCount,
  totalEnemyCount,
  type StagedEnemyEntry,
} from "./staged-enemy-queue"
import {
  isStagedEnemyEntry,
  useStagedEnemyQueue,
} from "./use-staged-enemy-queue"

/**
 * One staged group in the delve's pre-combat queue (UNN-541): a catalog creature,
 * the zone it will stand in, and how many of it. Staging happens **before** the
 * atomic mint, so a zone rides along on every group — `startDungeonEncounterAction`
 * takes this shape verbatim.
 */
export interface DungeonStagedEnemy extends StagedEnemyEntry {
  zoneId: string
}

const STORAGE_PREFIX = "unnamed-system:dungeon-enemy-queue:"

/** The delve queue groups by creature **and** zone: two zones, two groups. */
const identify = (entry: DungeonStagedEnemy) =>
  `${entry.enemyKey}::${entry.zoneId}`

function isDungeonStagedEnemy(value: unknown): value is DungeonStagedEnemy {
  return (
    isStagedEnemyEntry(value) &&
    typeof (value as DungeonStagedEnemy).zoneId === "string"
  )
}

/**
 * Re-homes a staged group into another zone. Landing on a zone that already
 * holds that creature **merges** the two groups — the same fold `addEntry` does
 * when the DM queues a creature twice, so a group's identity stays one thing.
 */
export function moveEntryZone(
  entries: DungeonStagedEnemy[],
  id: string,
  zoneId: string
): DungeonStagedEnemy[] {
  const moving = entries.find((entry) => identify(entry) === id)
  if (!moving) return entries

  return addEntry(
    removeEntry(entries, id, identify),
    { ...moving, zoneId },
    identify
  )
}

/** The delve staging queue's surface — every mutator addresses a group by id. */
export interface DungeonEnemyQueue {
  queue: DungeonStagedEnemy[]
  entryId: (entry: DungeonStagedEnemy) => string
  add: (enemyKey: string, zoneId: string) => void
  setCount: (id: string, count: number) => void
  setZone: (id: string, zoneId: string) => void
  remove: (id: string) => void
  clear: () => void
  totalCount: number
}

/**
 * The delve's staging queue, keyed by **dungeon id** (UNN-541) over the shared
 * {@link useStagedEnemyQueue} store — no encounter exists until the DM hits
 * Begin, so there is no encounter id to key by. Nothing persists server-side
 * until `startDungeonEncounterAction` mints the fight in one atomic write.
 */
export function useDungeonEnemyQueue(dungeonId: string): DungeonEnemyQueue {
  const { entries, update, clear } = useStagedEnemyQueue<DungeonStagedEnemy>({
    storageKey: `${STORAGE_PREFIX}${dungeonId}`,
    identify,
    isEntry: isDungeonStagedEnemy,
  })

  return {
    queue: entries,
    entryId: identify,
    add: (enemyKey, zoneId) =>
      update((current) =>
        addEntry(current, { enemyKey, zoneId, count: 1 }, identify)
      ),
    setCount: (id, count) =>
      update((current) => setEntryCount(current, id, count, identify)),
    setZone: (id, zoneId) =>
      update((current) => moveEntryZone(current, id, zoneId)),
    remove: (id) => update((current) => removeEntry(current, id, identify)),
    clear,
    totalCount: totalEnemyCount(entries),
  }
}
