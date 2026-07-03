"use client"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { EncounterWatch } from "@/components/encounter/encounter-watch"
import type { WatchSnapshot } from "@/hooks/use-encounter-snapshot"
import type {
  EncounterSnapshotResult,
  OwnedEncounterSheet,
} from "@/lib/db/queries/load-encounter-snapshot-v2"

/** Polls the **fogged** combat snapshot for a delve fight (UNN-536) — the fog
 *  twin of the mapless watch's default fetcher, hitting the delve-scoped route. */
async function fetchFoggedSnapshot(
  shortId: string,
  signal?: AbortSignal
): Promise<WatchSnapshot> {
  const response = await fetch(`/api/encounter/${shortId}/combat-snapshot`, {
    cache: "no-store",
    signal,
  })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  const result = (await response.json()) as EncounterSnapshotResult
  return { ...result.snapshot, compositeVersion: result.compositeVersion }
}

/**
 * The delve **combat** player watch (UNN-536) — the dungeon fog view composed over
 * a live encounter. It reuses the mapless {@link EncounterWatch} wholesale (the
 * redacted battlefield + the own-combat-sheet column), swapping only the poll
 * source for the **fogged** delve endpoint so a player never sees combatants in
 * zones the DM hasn't revealed. Keyed by the **encounter** `shortId` — the watch's
 * realtime channel + poll key — resolved by the page from the delve's live fight.
 */
export function DungeonCombatWatch({
  encounterShortId,
  initialSnapshot,
  initialCompositeVersion,
  ownedSheets,
}: {
  encounterShortId: string
  initialSnapshot: SpatialEncounterSnapshot
  initialCompositeVersion: string
  ownedSheets: OwnedEncounterSheet[]
}) {
  return (
    <EncounterWatch
      shortId={encounterShortId}
      initialSnapshot={initialSnapshot}
      initialCompositeVersion={initialCompositeVersion}
      ownedSheets={ownedSheets}
      fetcher={fetchFoggedSnapshot}
    />
  )
}
