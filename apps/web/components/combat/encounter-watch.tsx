"use client"

import {
  resolvePlayerZoneLayout,
  type EncounterSnapshot,
} from "@workspace/game/engine"

import { useEncounterSnapshot } from "@/hooks/use-encounter-snapshot"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot"
import { ENCOUNTER_STATUS_LABELS } from "@/lib/ui/labels"

import { CampaignBackLink } from "./campaign-back-link"
import { PlayerTurnOrder } from "./player-turn-order"
import { WatchEnemiesRail } from "./watch-enemies-rail"
import { WatchSheetColumn } from "./watch-sheet-column"
import { useOwnedSheetZoneEffectsRefresh } from "./watch-sheet-refresh"
import { ZoneLayout } from "./zone-layout"

/**
 * The **player watch view** at `/c/encounter/{shortId}` (UNN-322). Seeds from the
 * server-rendered `initialSnapshot` and subscribes to the DM's live changes via
 * {@link useEncounterSnapshot} (realtime, polling fallback — UNN-371).
 *
 * Three-column layout: when the signed-in viewer owns combatant(s) here
 * (`ownedSheets`), their character sheet fills the left column
 * ({@link WatchSheetColumn}) and the battlefield spans the other two; a spectator
 * (no owned sheet) gets the battlefield full-width. The battlefield reuses the DM
 * console's {@link ZoneLayout} grid, shaped from the redacted snapshot
 * ({@link resolvePlayerZoneLayout}) — enemy attributes/affinities are already
 * absent (UNN-324). The status fork mirrors the lifecycle: `draft` waits, `ended`
 * a concluded banner, `live` the full tracker.
 */
export function EncounterWatch({
  shortId,
  initialSnapshot,
  ownedSheets,
}: {
  shortId: string
  initialSnapshot: EncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  const { snapshot, stale } = useEncounterSnapshot(shortId, initialSnapshot)
  useOwnedSheetZoneEffectsRefresh(snapshot, ownedSheets)
  const hasSheets = ownedSheets.length > 0

  const battlefield =
    snapshot.status === "draft" ? (
      <WaitingState />
    ) : (
      <Battlefield snapshot={snapshot} ended={snapshot.status === "ended"} />
    )

  return (
    <main className="flex flex-col lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {snapshot.campaignShortId ? (
            <CampaignBackLink campaignShortId={snapshot.campaignShortId} />
          ) : null}
          <h1 className="truncate font-heading text-xl font-medium">
            {snapshot.name}
          </h1>
        </div>
        <StatusPill status={snapshot.status} stale={stale} />
      </header>

      {hasSheets ? (
        <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
          <div className="min-w-0 border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <WatchSheetColumn
              shortId={shortId}
              snapshot={snapshot}
              ownedSheets={ownedSheets}
            />
          </div>
          <div className="flex min-w-0 flex-col lg:col-span-2 lg:min-h-0">
            {battlefield}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          {battlefield}
        </div>
      )}
    </main>
  )
}

/**
 * The battlefield column for a `live` / `ended` encounter: the zone map flexes
 * and scrolls in the upper area, while the redacted {@link WatchEnemiesRail} pins
 * to the bottom — as the enemy list wraps it grows (up to a cap) and shortens the
 * map above it, rather than the whole column scrolling as one.
 */
function Battlefield({
  snapshot,
  ended,
}: {
  snapshot: EncounterSnapshot
  ended: boolean
}) {
  const enemies = snapshot.combatants.filter(
    (combatant) => combatant.side === "enemies"
  )
  const zoneNameById = new Map(
    snapshot.zones.map((zone) => [zone.id, zone.name])
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {ended ? (
          <p className="border border-dashed p-4 text-center text-sm text-muted-foreground">
            This encounter has concluded. Below is how it ended.
          </p>
        ) : null}
        <PlayerTurnOrder
          round={snapshot.round}
          currentActor={snapshot.currentActor}
          combatants={snapshot.combatants}
        />
        <ZoneLayout view={resolvePlayerZoneLayout(snapshot)} />
      </div>
      {enemies.length > 0 ? (
        <WatchEnemiesRail enemies={enemies} zoneNameById={zoneNameById} />
      ) : null}
    </div>
  )
}

function WaitingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="flex min-h-64 w-full items-center justify-center border border-dashed p-12 text-center text-sm text-muted-foreground">
        Waiting for the DM to start combat.
      </div>
    </div>
  )
}

/** The encounter's status, with a subtle "Reconnecting…" hint when a poll has
 *  failed but the last good snapshot is still shown. */
function StatusPill({
  status,
  stale,
}: {
  status: EncounterSnapshot["status"]
  stale: boolean
}) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      {stale ? <span className="text-xs">Reconnecting…</span> : null}
      <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
        {ENCOUNTER_STATUS_LABELS[status]}
      </span>
    </span>
  )
}
