"use client"

import type { RefObject } from "react"

import type { VersionClass } from "@/lib/db/version-classes"
import type { CharacterPing, CharacterPingKind } from "@/lib/realtime/publish"

/**
 * Parsing + forwarding for character invalidation pings (UNN-372). Every
 * `character`-channel payload funnels through {@link parseCharacterPing} to
 * extract the touched version map, which the consumer then forwards into its
 * version tokens — the v1 `CharacterProvider` via its
 * {@link import("./version-token-store").VersionTokenStore.forward}, the v2
 * `EntityWriteProvider` via {@link forwardPingedVersions} over its per-class
 * refs (UNN-569). The refresh decision + echo suppression live in that
 * forward-only compare (UNN-374).
 */

/** Touched version classes → new values, as published by the write shells. */
export type PingedVersions = CharacterPing["versions"]

/**
 * Narrows an untrusted ping payload to its `versions` map, or `null` when the
 * shape is wrong or the ping's `kind` isn't the one this consumer tracks.
 * Pings are advisory — a malformed one is dropped, never an error. Junk
 * keys/values inside the map are tolerated here and filtered by the caller's
 * forward-only compare.
 *
 * `kind` is mandatory because the dual-minted rows share the channel
 * ({@link CharacterPingKind}): a consumer that compares version tokens **must**
 * name its row family, or a ping from the other family strands its
 * forward-only tokens above the true value. `"any"` is for refresh-only
 * consumers (no token compare — e.g. the dungeon explore body), which want
 * every write regardless of family. A ping with no `kind` (a not-yet-updated
 * server during a deploy window) is ambiguous and dropped by family-filtered
 * consumers — worth a briefly missed live update, never a corrupted token.
 */
export function parseCharacterPing(
  data: unknown,
  kind: CharacterPingKind | "any"
): PingedVersions | null {
  if (typeof data !== "object" || data === null) return null
  const ping = data as { kind?: unknown; versions?: unknown }
  if (kind !== "any" && ping.kind !== kind) return null
  if (typeof ping.versions !== "object" || ping.versions === null) return null
  return ping.versions as PingedVersions
}

/**
 * `EntityWriteProvider`'s forward-only ping ingest (UNN-569) — the ref-flavored
 * sibling of {@link import("./version-token-store").VersionTokenStore.forward}.
 * Advances each class ref to the pinged version iff strictly fresher; keys
 * outside the provider's closed class set and non-finite values are ignored
 * (pings are advisory). Returns whether anything advanced — the caller's
 * `router.refresh()` trigger, which is also the echo suppression: a ping for
 * this tab's own committed write arrives at a version the success path already
 * bumped the ref to, so nothing is fresher and nothing refreshes.
 */
export function forwardPingedVersions(
  refs: Record<VersionClass, RefObject<number>>,
  versions: PingedVersions
): boolean {
  let fresher = false
  for (const [key, version] of Object.entries(versions)) {
    if (!(key in refs)) continue
    if (typeof version !== "number" || !Number.isFinite(version)) continue
    const ref = refs[key as VersionClass]
    if (version > ref.current) {
      ref.current = version
      fresher = true
    }
  }
  return fresher
}
