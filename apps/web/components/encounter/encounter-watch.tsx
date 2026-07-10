"use client"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { CombatSheetColumn } from "@/components/combat/watch/combat-sheet-column"
import { useOwnedSheetRefresh } from "@/components/combat/watch/owned-sheet-refresh"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import {
  useEncounterSnapshot,
  type WatchSnapshot,
} from "@/hooks/use-encounter-snapshot"
import type { SnapshotFetcher } from "@/hooks/use-snapshot-subscription"
import { buildWatchView } from "@/lib/combat/view/watch-layout"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot-v2"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { ENCOUNTER_STATUS_LABELS } from "@/lib/ui/labels"

import { PlayerTurnOrder } from "./player-turn-order"
import { WatchEnemiesRail } from "./watch-enemies-rail"
import { ZoneLayout } from "./zone-layout"

/**
 * The **player watch view** at `/c/encounter/{shortId}` (UNN-322 → UNN-535 on
 * v2). Seeds from the server-rendered snapshot + composite version and
 * subscribes to the DM's live changes via {@link useEncounterSnapshot}
 * (realtime, polling fallback — UNN-371); the composite version is what the
 * apply guard equality-compares, so a durable PC's HP bump invalidates even
 * when both row tokens held still.
 *
 * Every combatant datum renders **structurally off the redacted components**
 * (a dropped key ⇒ no affordance) via {@link buildWatchView}. The status fork
 * mirrors the lifecycle: `draft` waits, `ended` a concluded banner, `live` the
 * full tracker.
 *
 * A signed-in viewer who owns combatant(s) here also gets the {@link
 * CombatSheetColumn} on the left (UNN-566), so vitals and the Archetype
 * mechanic are managed in place. A spectator owns none, so the column doesn't
 * render and the battlefield takes the full width.
 */
export function EncounterWatch({
  shortId,
  initialSnapshot,
  initialCompositeVersion,
  ownedSheets,
  fetcher,
}: {
  shortId: string
  initialSnapshot: SpatialEncounterSnapshot
  initialCompositeVersion: string
  /** The viewer's own combatants here — empty for a spectator. */
  ownedSheets: OwnedEncounterSheet[]
  /** Overrides the poll source (UNN-536): a delve combat watch fetches the
   *  **fogged** snapshot. Defaults to the mapless full-map endpoint. */
  fetcher?: SnapshotFetcher<WatchSnapshot>
}) {
  const { snapshot, stale } = useEncounterSnapshot(
    shortId,
    {
      ...initialSnapshot,
      compositeVersion: initialCompositeVersion,
    },
    fetcher
  )
  useOwnedSheetRefresh(snapshot, ownedSheets)

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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {ownedSheets.length > 0 ? (
          <aside
            aria-label="Your characters"
            className="shrink-0 border-b px-4 py-4 lg:w-[340px] lg:overflow-y-auto lg:border-r lg:border-b-0"
          >
            <CombatSheetColumn snapshot={snapshot} ownedSheets={ownedSheets} />
          </aside>
        ) : null}
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
          {battlefield}
        </div>
      </div>
    </main>
  )
}

/**
 * The battlefield column for a `live` / `ended` encounter: the zone map flexes
 * and scrolls in the upper area, while the redacted {@link WatchEnemiesRail}
 * pins to the bottom — as the enemy list wraps it grows (up to a cap) and
 * shortens the map above it, rather than the whole column scrolling as one.
 */
function Battlefield({
  snapshot,
  ended,
}: {
  snapshot: WatchSnapshot
  ended: boolean
}) {
  const view = buildWatchView(snapshot)

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
          combatants={view.combatants}
        />
        <ZoneLayout view={view.layout} />
      </div>
      {view.enemies.length > 0 ? (
        <WatchEnemiesRail
          enemies={view.enemies}
          zoneNameById={view.zoneNameById}
        />
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
function StatusPill({ status, stale }: { status: string; stale: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      {stale ? <span className="text-xs">Reconnecting…</span> : null}
      <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
        {ENCOUNTER_STATUS_LABELS[status as EncounterStatus] ?? status}
      </span>
    </span>
  )
}
