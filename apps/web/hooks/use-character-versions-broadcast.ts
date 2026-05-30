"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import type { VersionClass } from "@/lib/db/version-classes"

/**
 * Cross-tab notification for per-write-class version bumps (UNN-203). When a
 * write lands in tab A, every other tab open on the same character refreshes
 * its server-rendered state via `router.refresh()`, so its prop-derived
 * version refs converge with the fresh server values without a manual
 * reload. Uses the `BroadcastChannel` API — no websocket, no service worker,
 * no sync engine.
 *
 * Same-tab echoes are filtered by `TAB_ID`: BroadcastChannel does not
 * deliver to the sending channel instance, but it *does* deliver to other
 * instances in the same tab — without the filter, every successful save
 * would trigger a redundant `router.refresh()` in its own tab on top of
 * the `revalidateCharacter` the server action already runs.
 *
 * No-ops when `BroadcastChannel` is unavailable (older Safari, some test
 * runners): the silent-retry path still works; cross-tab convergence
 * downgrades to "next page interaction" instead of "live."
 */

interface VersionBroadcastMessage {
  senderTabId: string
  classes: VersionClass[]
}

const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "ssr"

function channelName(characterId: string): string {
  return `character-versions:${characterId}`
}

/**
 * Posts a class-tagged invalidation on the per-character channel. Called
 * from the write primitives' success path. Safe to call from any client
 * context; silently no-ops when BroadcastChannel is unavailable.
 */
export function broadcastCharacterVersion(
  characterId: string,
  classes: VersionClass[]
): void {
  if (typeof window === "undefined") return
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(channelName(characterId))
  const message: VersionBroadcastMessage = {
    senderTabId: TAB_ID,
    classes,
  }
  channel.postMessage(message)
  channel.close()
}

/**
 * Subscribes the current tab to per-character version invalidations and
 * triggers `router.refresh()` on every non-self message. Mount once at the
 * sheet root (inside `CharacterProvider`).
 */
export function useCharacterVersionBroadcast(characterId: string): void {
  const router = useRouter()
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(channelName(characterId))
    channel.onmessage = (event: MessageEvent<VersionBroadcastMessage>) => {
      if (event.data.senderTabId === TAB_ID) return
      router.refresh()
    }
    return () => channel.close()
  }, [characterId, router])
}
