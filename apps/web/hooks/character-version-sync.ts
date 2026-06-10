"use client"

import type { RefObject } from "react"

import type { VersionClass } from "@/lib/db/version-classes"
import type { CharacterPing } from "@/lib/realtime/publish"

/**
 * The shared version-compare for character invalidation pings (UNN-372). Both
 * remote-change transports — the Ably channel and the UNN-203 cross-tab
 * `BroadcastChannel` — funnel their payloads through {@link mergePingedVersions}
 * so the refresh decision and its echo suppression live in exactly one place:
 * the writer's own tab (whose refs were already bumped by
 * `dispatchCharacterWriteWithRetry`) and any tab the other transport reached
 * first see nothing fresher and skip the redundant `router.refresh()`.
 */

/** Touched version classes → new values, as published by the write shells. */
export type PingedVersions = CharacterPing["versions"]

/**
 * Narrows an untrusted ping payload to its `versions` map, or `null` when the
 * shape is wrong. Pings are advisory — a malformed one is dropped, never an
 * error. Junk keys/values inside the map are tolerated here and filtered by
 * {@link mergePingedVersions}.
 */
export function parseCharacterPing(data: unknown): PingedVersions | null {
  if (typeof data !== "object" || data === null) return null
  const versions = (data as { versions?: unknown }).versions
  if (typeof versions !== "object" || versions === null) return null
  return versions as PingedVersions
}

/**
 * Forwards each per-class version ref that a ping proves stale and reports
 * whether anything was actually fresher (the caller's refresh trigger).
 * Forwarding is sound: the refs hold the *latest known* token (the write
 * dispatch already mutates them outside React), versions are monotonic so the
 * prop-sync can't regress them, and a save issued after a forward simply
 * succeeds first-try instead of taking the stale→retry round-trip.
 */
export function mergePingedVersions(
  pinged: PingedVersions,
  refs: Record<VersionClass, RefObject<number>>
): boolean {
  let fresher = false
  for (const [versionClass, version] of Object.entries(pinged)) {
    const ref = refs[versionClass as VersionClass]
    if (!ref || typeof version !== "number" || !Number.isFinite(version)) {
      continue
    }
    if (version > ref.current) {
      ref.current = version
      fresher = true
    }
  }
  return fresher
}
