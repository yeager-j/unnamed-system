"use client"

import { getEncounterVersionAction } from "@/lib/actions/encounter/version"

/**
 * Adapts {@link getEncounterVersionAction} into the `refetchVersion` shape
 * {@link import("./use-queued-write").useQueuedWrite} expects: the current
 * encounter `version` for `shortId`, or `null` when the refetch can't resolve
 * one (missing row, malformed input). The three encounter write surfaces — the
 * DM console, encounter setup, the player's own-combat-event — share this so the
 * stale-retry wiring is identical across them.
 */
export async function fetchEncounterVersion(
  shortId: string
): Promise<number | null> {
  const result = await getEncounterVersionAction({ shortId })
  return result.ok ? result.value.version : null
}
