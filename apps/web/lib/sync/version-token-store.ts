"use client"

import { useRef } from "react"

/**
 * The optimistic-concurrency "latest known version token" invariants (monotonic,
 * forward-only, bump-on-success) given a named type (UNN-374).
 *
 * Versions are server-monotonic: every guarded write returns `expected + 1`, so a
 * token only ever increments. A value lower than the tracked one is a stale render
 * frame (a `router.refresh()` still in flight, a poll that raced a just-landed
 * write) and is dropped, never rolled back.
 *
 * {@link MonotonicVersionMap} is an **open** set of entities each holding one
 * token (the DM console's per-PC `vitals` version); the single-key forward-set is
 * {@link MonotonicVersionMap.bump}.
 */

/**
 * The one place the monotonic invariant lives: advance `key` to `version` iff it
 * is fresher than the tracked value (or the key is unseen).
 */
function bumpToken<K>(tokens: Map<K, number>, key: K, version: number): void {
  const current = tokens.get(key)
  if (current !== undefined && version <= current) return
  tokens.set(key, version)
}

// ── Open-key façade: MonotonicVersionMap (the DM console's per-PC vitals) ──────

export interface MonotonicVersionMap<K> {
  /** The latest known token for `key`, or `undefined` if never seen. */
  read(key: K): number | undefined
  /** Advance `key` to `version` if fresher; creates the entry if unseen. */
  bump(key: K, version: number): void
}

/** The React-free factory; the console uses {@link useMonotonicVersionMap}. */
export function createMonotonicVersionMap<K>(): MonotonicVersionMap<K> {
  const tokens = new Map<K, number>()

  return {
    read: (key) => tokens.get(key),
    bump: (key, version) => {
      bumpToken(tokens, key, version)
    },
  }
}

/**
 * The console-side hook: one open-keyed map, stable across renders. The caller
 * seeds/forwards each key from its own dynamic props (the per-PC `vitalsVersion`),
 * because the keyspace (which PCs exist) lives in those props, not here.
 */
export function useMonotonicVersionMap<K>(): MonotonicVersionMap<K> {
  const mapRef = useRef<MonotonicVersionMap<K> | null>(null)
  return (mapRef.current ??= createMonotonicVersionMap<K>())
}
