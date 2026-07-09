/**
 * The pure transitions behind the staging queues (UNN-541) — a shopping cart of
 * catalog enemies, not an encounter roster. Both queues (mapless, keyed by enemy
 * key; delve, keyed by enemy × zone) are the same list under a different
 * **identity**, so the identity arrives as a function and the ops stay shared.
 */

/** Every staged entry names a catalog creature and how many of it are queued. */
export interface StagedEnemyEntry {
  enemyKey: string
  count: number
}

/** A staged entry's group identity — what "the same group" means to a queue. */
export type IdentifyEntry<T extends StagedEnemyEntry> = (entry: T) => string

/** Adds an entry, folding its count into the matching group when one exists. */
export function addEntry<T extends StagedEnemyEntry>(
  entries: T[],
  entry: T,
  identify: IdentifyEntry<T>
): T[] {
  const id = identify(entry)
  const existing = entries.find((current) => identify(current) === id)
  if (!existing) return [...entries, entry]

  return entries.map((current) =>
    identify(current) === id
      ? { ...current, count: current.count + entry.count }
      : current
  )
}

/** Sets a group's count; a count of zero or less drops the group entirely. */
export function setEntryCount<T extends StagedEnemyEntry>(
  entries: T[],
  id: string,
  count: number,
  identify: IdentifyEntry<T>
): T[] {
  if (count <= 0) return removeEntry(entries, id, identify)

  return entries.map((entry) =>
    identify(entry) === id ? { ...entry, count } : entry
  )
}

/** Drops a group. */
export function removeEntry<T extends StagedEnemyEntry>(
  entries: T[],
  id: string,
  identify: IdentifyEntry<T>
): T[] {
  return entries.filter((entry) => identify(entry) !== id)
}

/** The queue's running size — the number of creatures a commit would mint. */
export function totalEnemyCount(entries: StagedEnemyEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0)
}
