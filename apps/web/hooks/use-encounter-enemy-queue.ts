"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * One staged catalog enemy and how many of it to add. The browse surface
 * (UNN-346) collects these locally before the DM commits them as combatants —
 * the queue is *not* the encounter roster, just a shopping cart.
 */
export interface QueuedEnemy {
  enemyKey: string
  count: number
}

const STORAGE_PREFIX = "unnamed-system:encounter-enemy-queue:"
/** Same-tab change signal: the `storage` event only fires in *other* tabs, so
 *  writes dispatch this to notify subscribers in the writing tab too. */
const CHANGE_EVENT = "unnamed-system:enemy-queue-change"

function storageKey(encounterId: string): string {
  return `${STORAGE_PREFIX}${encounterId}`
}

function parseQueue(raw: string | null): QueuedEnemy[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is QueuedEnemy =>
        typeof entry?.enemyKey === "string" &&
        typeof entry?.count === "number" &&
        entry.count > 0
    )
  } catch {
    return []
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function writeQueue(encounterId: string, queue: QueuedEnemy[]): void {
  window.localStorage.setItem(storageKey(encounterId), JSON.stringify(queue))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

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
 * A staging queue of catalog enemies, mirrored to `localStorage` keyed by
 * encounter id so a reload or accidental nav-away never loses the DM's
 * selections (UNN-346). Backed by `useSyncExternalStore` over localStorage: the
 * server snapshot is empty (no mismatch on hydration), every mutation reads the
 * fresh stored value before applying its change (no stale closures), and writes
 * notify this and any other open tab. Committing or cancelling clears it.
 *
 * The queue holds `{ enemyKey, count }` — adding the same key again just bumps
 * its count; `setCount` to 0 (or below) drops the entry, as does `remove`.
 */
export function useEncounterEnemyQueue(
  encounterId: string
): EncounterEnemyQueue {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(storageKey(encounterId)),
    () => null
  )
  const queue = useMemo(() => parseQueue(raw), [raw])

  const update = useCallback(
    (transform: (current: QueuedEnemy[]) => QueuedEnemy[]) => {
      const current = parseQueue(
        window.localStorage.getItem(storageKey(encounterId))
      )
      writeQueue(encounterId, transform(current))
    },
    [encounterId]
  )

  const add = useCallback(
    (enemyKey: string, by = 1) =>
      update((current) => {
        const existing = current.find((entry) => entry.enemyKey === enemyKey)
        return existing
          ? current.map((entry) =>
              entry.enemyKey === enemyKey
                ? { ...entry, count: entry.count + by }
                : entry
            )
          : [...current, { enemyKey, count: by }]
      }),
    [update]
  )

  const setCount = useCallback(
    (enemyKey: string, count: number) =>
      update((current) =>
        count <= 0
          ? current.filter((entry) => entry.enemyKey !== enemyKey)
          : current.map((entry) =>
              entry.enemyKey === enemyKey ? { ...entry, count } : entry
            )
      ),
    [update]
  )

  const remove = useCallback(
    (enemyKey: string) =>
      update((current) =>
        current.filter((entry) => entry.enemyKey !== enemyKey)
      ),
    [update]
  )

  const clear = useCallback(() => update(() => []), [update])

  const totalCount = useMemo(
    () => queue.reduce((sum, entry) => sum + entry.count, 0),
    [queue]
  )

  return { queue, add, setCount, remove, clear, totalCount }
}
