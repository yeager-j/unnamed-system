"use client"

import type { RefObject } from "react"

import type { Result } from "@workspace/game/foundation/result"

import { EDIT_SURFACE_CLASS, type EditSurface } from "@/lib/db/version-classes"

import { getCharacterVersionsAction } from "../lib/actions/character-versions"
import { broadcastCharacterVersion } from "./use-character-versions-broadcast"

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
 *
 * Callers name the edit `surface`, not the version class (UNN-254): the
 * class — needed only for the cross-tab broadcast tag and the
 * `${class}Version` refetch field — is resolved here from
 * {@link EDIT_SURFACE_CLASS}, the one place surface→class lives (UNN-233).
 * Every client call site therefore names a surface and nothing else.
 */
export async function dispatchCharacterWriteWithRetry<
  TSuccess extends { version: number },
  TError extends string,
>({
  characterId,
  surface,
  versionRef,
  action,
}: {
  characterId: string
  surface: EditSurface
  versionRef: RefObject<number>
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
}): Promise<Result<TSuccess, TError>> {
  const characterClass = EDIT_SURFACE_CLASS[surface]
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
