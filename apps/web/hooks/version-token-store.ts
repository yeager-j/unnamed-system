"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * The optimistic-concurrency "latest known version token" invariants (monotonic,
 * forward-only, bump-on-success, prop-sync absorbs server values) given a named
 * type, replacing the ~six client shapes that hand-rolled them (UNN-374).
 *
 * Versions are server-monotonic: every guarded write returns `expected + 1`, so a
 * token only ever increments. A value lower than the tracked one is a stale render
 * frame (a `router.refresh()` still in flight, a poll that raced a just-landed
 * write) and is dropped, never rolled back.
 *
 * One shared core — {@link bumpToken}, a forward-only set over a `Map` — backs two
 * façades that differ by **cardinality**, not by invariant:
 *
 * - {@link VersionTokenStore} — a **closed** set of classes for one entity (the
 *   character sheet's four classes). Adds {@link VersionTokenStore.forward} to
 *   ingest a whole ping payload at once.
 * - {@link MonotonicVersionMap} — an **open** set of entities each holding one
 *   token (the DM console's per-PC `vitals` version). No `forward`/class
 *   dimension; the single-key forward-set is just {@link MonotonicVersionMap.bump}.
 */

/**
 * The one place the monotonic invariant lives: advance `key` to `version` iff it
 * is fresher than the tracked value (or the key is unseen). Returns whether it
 * advanced — the only signal {@link VersionTokenStore.forward} needs.
 */
function bumpToken<K>(
  tokens: Map<K, number>,
  key: K,
  version: number
): boolean {
  const current = tokens.get(key)
  if (current !== undefined && version <= current) return false
  tokens.set(key, version)
  return true
}

// ── Closed-key façade: VersionTokenStore (the character sheet) ────────────────

export interface VersionTokenStore<Class extends string> {
  /** The latest known token for `cls`. */
  read(cls: Class): number
  /** Advance `cls` to `version` if fresher; a lower value is a no-op. */
  bump(cls: Class, version: number): void
  /**
   * Absorb a ping/broadcast payload (untrusted) and report whether anything
   * advanced — the caller's refresh trigger. Non-number / non-finite values and
   * keys outside this store's class set are ignored (pings are advisory).
   */
  forward(pinged: Partial<Record<Class, number>>): boolean
  /**
   * The `RefObject<number>` view of one class's token — the legacy bridge for the
   * consumers whose signatures still take a raw ref
   * (`dispatchCharacterWriteWithRetry`, `useDebouncedAutoSave`). The adapter
   * closes over the store — getter is {@link read}, setter is the forward-only
   * {@link bump} — so it is a view, not a snapshot. Layer 2/3 retire it.
   */
  ref(cls: Class): RefObject<number>
  // Layer 3 (per the unified-writes ADR) adds `snapshot(): Record<Class, number>`
  // for the cross-class action payloads (level-up/rest); omitted until consumed.
}

/**
 * The React-free factory. Use directly only where a store must be created outside
 * the render cycle; the sheet uses {@link useVersionTokenStore} so it prop-syncs.
 */
export function createVersionTokenStore<Class extends string>(
  initial: Record<Class, number>
): VersionTokenStore<Class> {
  const tokens = new Map<string, number>(Object.entries(initial))
  const refs = new Map<Class, RefObject<number>>()

  return {
    // Non-null: every class is seeded from `initial`, so the key is always present.
    read: (cls) => tokens.get(cls)!,
    bump: (cls, version) => {
      bumpToken(tokens, cls, version)
    },
    forward(pinged) {
      let fresher = false
      for (const [key, version] of Object.entries(pinged)) {
        if (typeof version !== "number" || !Number.isFinite(version)) continue
        if (!tokens.has(key)) continue // closed key set — ignore foreign keys
        if (bumpToken(tokens, key, version)) fresher = true
      }
      return fresher
    },
    ref(cls) {
      let adapter = refs.get(cls)
      if (!adapter) {
        adapter = {
          get current() {
            return tokens.get(cls)!
          },
          set current(version: number) {
            bumpToken(tokens, cls, version)
          },
        }
        refs.set(cls, adapter)
      }
      return adapter
    },
  }
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

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * The sheet-side hook: one store seeded from the server versions and kept synced
 * **forward-only** from them. The prop-sync runs `forward` every commit rather
 * than keying an effect to each class — `serverVersions` is a fresh object each
 * render, so a dependency array buys nothing, and `forward` is idempotent. The
 * contract that makes the dependency-free effect correct is that `forward` stays
 * **side-effect-free**: it only `max`-assigns, so a no-change commit is a no-op.
 */
export function useVersionTokenStore<Class extends string>(
  serverVersions: Record<Class, number>
): VersionTokenStore<Class> {
  const storeRef = useRef<VersionTokenStore<Class> | null>(null)
  const store = (storeRef.current ??= createVersionTokenStore(serverVersions))

  useEffect(() => {
    store.forward(serverVersions)
  })

  return store
}

/**
 * The console-side hook: one open-keyed map, stable across renders. Unlike
 * {@link useVersionTokenStore} it owns no prop-sync — the caller seeds/forwards
 * each key from its own dynamic props (the per-PC `vitalsVersion`), because the
 * keyspace (which PCs exist) lives in those props, not here.
 */
export function useMonotonicVersionMap<K>(): MonotonicVersionMap<K> {
  const mapRef = useRef<MonotonicVersionMap<K> | null>(null)
  return (mapRef.current ??= createMonotonicVersionMap<K>())
}
