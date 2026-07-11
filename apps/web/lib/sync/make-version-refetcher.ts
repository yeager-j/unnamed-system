"use client"

import { type Result } from "@workspace/game-v2/kernel/result"

/**
 * Builds a `refetchVersion` adapter for
 * {@link import("./use-queued-write").useQueuedWrite} from a read-only version
 * Server Action: the returned function resolves the current `version` for
 * `shortId`, or `null` when the refetch can't (missing row, malformed input).
 * The encounter and Map-Instance stale-retry paths are the same shape — one
 * `{ shortId }` action read, `value.version` on success — differing only in which
 * action they call, so both come from this one factory.
 */
export function makeVersionRefetcher(
  action: (input: {
    shortId: string
  }) => Promise<Result<{ version: number }, unknown>>
): (shortId: string) => Promise<number | null> {
  return async (shortId) => {
    const result = await action({ shortId })
    return result.ok ? result.value.version : null
  }
}
