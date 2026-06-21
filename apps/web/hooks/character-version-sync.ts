"use client"

import type { CharacterPing } from "@/lib/realtime/publish"

/**
 * Parsing for character invalidation pings (UNN-372). Both remote-change
 * transports — the Ably channel and the UNN-203 cross-tab `BroadcastChannel` —
 * funnel their payloads through {@link parseCharacterPing} to extract the touched
 * version map, which the consumer then forwards into its
 * {@link import("./version-token-store").VersionTokenStore} (the refresh decision
 * + echo suppression live there, UNN-374).
 */

/** Touched version classes → new values, as published by the write shells. */
export type PingedVersions = CharacterPing["versions"]

/**
 * Narrows an untrusted ping payload to its `versions` map, or `null` when the
 * shape is wrong. Pings are advisory — a malformed one is dropped, never an
 * error. Junk keys/values inside the map are tolerated here and filtered by
 * {@link import("./version-token-store").VersionTokenStore.forward}.
 */
export function parseCharacterPing(data: unknown): PingedVersions | null {
  if (typeof data !== "object" || data === null) return null
  const versions = (data as { versions?: unknown }).versions
  if (typeof versions !== "object" || versions === null) return null
  return versions as PingedVersions
}
