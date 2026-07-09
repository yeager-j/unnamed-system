"use client"

import { useSyncExternalStore } from "react"

import type { IdentifyEntry, StagedEnemyEntry } from "./staged-enemy-queue"

/** Same-tab change signal: the `storage` event only fires in *other* tabs, so
 *  writes dispatch this to notify subscribers in the writing tab too. */
const CHANGE_EVENT = "unnamed-system:enemy-queue-change"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** The stored slice a queue hook reads and rewrites, plus its group identity. */
export interface StagedEnemyStore<T extends StagedEnemyEntry> {
  storageKey: string
  identify: IdentifyEntry<T>
  isEntry: (value: unknown) => value is T
}

/** What every staging queue hands its rail: the entries and the group mutators. */
export interface StagedEnemyQueue<T extends StagedEnemyEntry> {
  entries: T[]
  update: (transform: (current: T[]) => T[]) => void
  clear: () => void
}

/**
 * A staging queue of catalog enemies mirrored to `localStorage`, so a reload or
 * accidental nav-away never loses the DM's selections (UNN-346). Backed by
 * `useSyncExternalStore`: the server snapshot is null (no hydration mismatch),
 * every mutation re-reads the fresh stored value before applying its transform
 * (no stale closures), and writes notify this and any other open tab.
 *
 * The queue's **key** and **entry shape** are the caller's (UNN-541) — the
 * mapless encounter keys by encounter id and stages `{ enemyKey, count }`; the
 * delve keys by dungeon id (no encounter exists until Begin) and stages
 * `{ enemyKey, zoneId, count }`. Malformed stored entries are dropped on read.
 */
export function useStagedEnemyQueue<T extends StagedEnemyEntry>({
  storageKey,
  isEntry,
}: StagedEnemyStore<T>): StagedEnemyQueue<T> {
  const raw = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(storageKey),
    () => null
  )

  function read(value: string | null): T[] {
    if (!value) return []
    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isEntry)
    } catch {
      return []
    }
  }

  function update(transform: (current: T[]) => T[]): void {
    const next = transform(read(window.localStorage.getItem(storageKey)))
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  return { entries: read(raw), update, clear: () => update(() => []) }
}

/** True when a stored value carries the fields every staged entry must have. */
export function isStagedEnemyEntry(value: unknown): value is StagedEnemyEntry {
  const entry = value as StagedEnemyEntry | null
  return (
    typeof entry?.enemyKey === "string" &&
    typeof entry?.count === "number" &&
    entry.count > 0
  )
}
