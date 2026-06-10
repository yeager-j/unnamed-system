"use client"

import { useEffect, useRef } from "react"

import type { PingedVersions } from "./character-version-sync"

/**
 * Cross-tab notification for per-write-class version bumps (UNN-203). When a
 * write lands in tab A, every other tab open on the same character learns the
 * touched classes' new versions. Uses the `BroadcastChannel` API — no
 * websocket, no service worker, no sync engine.
 *
 * Since UNN-372 the message carries the bumped *versions* (not just the
 * classes) and the receiver routes them through the same shared
 * version-compare the Ably ping uses (`mergePingedVersions` in the
 * `CharacterProvider`), instead of unconditionally refreshing. Whichever
 * transport reaches a sibling tab first forwards its refs; the other then
 * sees nothing fresher and no-ops — no double `router.refresh()`. This
 * channel remains the cross-tab fallback when realtime is unavailable.
 *
 * Same-tab echoes are filtered by `TAB_ID`: BroadcastChannel does not
 * deliver to the sending channel instance, but it *does* deliver to other
 * instances in the same tab — without the filter, every successful save
 * would feed the compare redundantly in its own tab on top of the
 * `revalidateCharacter` the server action already runs.
 *
 * No-ops when `BroadcastChannel` is unavailable (older Safari, some test
 * runners): the silent-retry path still works; cross-tab convergence
 * downgrades to the Ably ping, or without realtime to "next page
 * interaction" instead of "live."
 */

interface VersionBroadcastMessage {
  senderTabId: string
  versions: PingedVersions
}

const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "ssr"

function channelName(characterId: string): string {
  return `character-versions:${characterId}`
}

/**
 * Posts the touched classes' new versions on the per-character channel.
 * Called from the write primitives' success path. Safe to call from any
 * client context; silently no-ops when BroadcastChannel is unavailable.
 */
export function broadcastCharacterVersion(
  characterId: string,
  versions: PingedVersions
): void {
  if (typeof window === "undefined") return
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(channelName(characterId))
  const message: VersionBroadcastMessage = {
    senderTabId: TAB_ID,
    versions,
  }
  channel.postMessage(message)
  channel.close()
}

/**
 * Subscribes the current tab to per-character version broadcasts and hands
 * every non-self message's versions to `onVersions` (the provider's shared
 * compare-then-refresh handler). Mount once at the sheet root (inside
 * `CharacterProvider`).
 */
export function useCharacterVersionBroadcast(
  characterId: string,
  onVersions: (versions: PingedVersions) => void
): void {
  const onVersionsRef = useRef(onVersions)
  useEffect(() => {
    onVersionsRef.current = onVersions
  })

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(channelName(characterId))
    channel.onmessage = (event: MessageEvent<VersionBroadcastMessage>) => {
      if (event.data.senderTabId === TAB_ID) return
      onVersionsRef.current(event.data.versions ?? {})
    }
    return () => channel.close()
  }, [characterId])
}
