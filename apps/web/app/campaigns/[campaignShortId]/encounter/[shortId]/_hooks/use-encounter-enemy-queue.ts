"use client"

import {
  addEntry,
  removeEntry,
  setEntryCount,
  totalEnemyCount,
  type StagedEnemyEntry,
} from "@/domain/combat/staged-enemy-queue"
import {
  isStagedEnemyEntry,
  useStagedEnemyQueue,
} from "@/domain/combat/use-staged-enemy-queue"

/**
 * One staged catalog enemy and how many of it to add. The browse surface
 * (UNN-346) collects these locally before the DM commits them as combatants —
 * the queue is *not* the encounter roster, just a shopping cart.
 */
export type QueuedEnemy = StagedEnemyEntry

const STORAGE_PREFIX = "unnamed-system:encounter-enemy-queue:"

/** The mapless queue groups by creature: adding a key again bumps its count. */
const identify = (entry: QueuedEnemy) => entry.enemyKey

/** The hook's surface: the queued entries plus the mutators the rail + list use. */
export interface EncounterEnemyQueue {
  queue: QueuedEnemy[]
  add: (enemyKey: string, by?: number) => void
  setCount: (enemyKey: string, count: number) => void
  remove: (enemyKey: string) => void
  clear: () => void
  totalCount: number
}

/**
 * The mapless encounter's staging queue, keyed by encounter id (UNN-346) over
 * the shared {@link useStagedEnemyQueue} store. Committing or cancelling clears
 * it; `setCount` to 0 (or below) drops the entry, as does `remove`.
 */
export function useEncounterEnemyQueue(
  encounterId: string
): EncounterEnemyQueue {
  const { entries, update, clear } = useStagedEnemyQueue<QueuedEnemy>({
    storageKey: `${STORAGE_PREFIX}${encounterId}`,
    identify,
    isEntry: isStagedEnemyEntry,
  })

  return {
    queue: entries,
    add: (enemyKey, by = 1) =>
      update((current) => addEntry(current, { enemyKey, count: by }, identify)),
    setCount: (enemyKey, count) =>
      update((current) => setEntryCount(current, enemyKey, count, identify)),
    remove: (enemyKey) =>
      update((current) => removeEntry(current, enemyKey, identify)),
    clear,
    totalCount: totalEnemyCount(entries),
  }
}
