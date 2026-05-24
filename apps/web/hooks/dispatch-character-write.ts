"use client"

import type { RefObject } from "react"

import { getCharacterVersionsAction } from "../lib/actions/character-versions"
import type { Result } from "../lib/game/result"
import {
  broadcastCharacterVersion,
  type VersionClass,
} from "./use-character-versions-broadcast"

/**
 * The shared retry-and-broadcast pipeline every character write composes
 * through (UNN-203). Both client write primitives — the debounced
 * text-editor hook (`useDebouncedAutoSave`) and the optimistic click action
 * (e.g. `components/character-sheet/inventory.tsx`) — call this so the same
 * silent-stale-retry + cross-tab-broadcast behavior applies uniformly. No
 * consumer-facing opt-in.
 *
 * Pipeline:
 * 1. Call `action` with the current `versionRef` value.
 * 2. On success: update `versionRef` from the response, broadcast a
 *    class-tagged invalidation to sibling tabs, return the result.
 * 3. On `"stale"`: refetch the fresh version for the affected class,
 *    update `versionRef`, retry `action` *once*. A second `"stale"` means a
 *    real concurrent third-party write — fall through to the caller's
 *    toast.
 * 4. On any other error: return unchanged.
 *
 * Retry budget is fixed at one. Two retries would mask a real conflict
 * storm; we'd rather surface it. If the refetch itself fails (action
 * threw / character was deleted), the original `"stale"` bubbles through.
 *
 * The helper mutates `versionRef.current` on both success and pre-retry
 * paths so the consumer's next dispatch reads the latest value without
 * waiting for React commit + effects to propagate the new prop.
 */
export async function dispatchCharacterWriteWithRetry<
  TSuccess extends { version: number },
  TError extends string,
>({
  characterId,
  characterClass,
  versionRef,
  action,
}: {
  characterId: string
  characterClass: VersionClass
  versionRef: RefObject<number>
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
}): Promise<Result<TSuccess, TError>> {
  const first = await action(versionRef.current)
  if (first.ok) {
    versionRef.current = first.value.version
    broadcastCharacterVersion(characterId, [characterClass])
    return first
  }
  if (first.error !== "stale") return first

  const fresh = await getCharacterVersionsAction({ characterId })
  if (!fresh.ok) return first
  versionRef.current = fresh.value[`${characterClass}Version`]

  const second = await action(versionRef.current)
  if (second.ok) {
    versionRef.current = second.value.version
    broadcastCharacterVersion(characterId, [characterClass])
  }
  return second
}
