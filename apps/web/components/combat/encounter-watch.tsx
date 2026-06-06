"use client"

import {
  resolvePlayerView,
  type EncounterSnapshot,
} from "@workspace/game/engine"

import { useEncounterSnapshot } from "@/hooks/use-encounter-snapshot"
import { ENCOUNTER_STATUS_LABELS } from "@/lib/ui/labels"

import { CampaignBackLink } from "./campaign-back-link"
import { PlayerTurnOrder } from "./player-turn-order"
import { PlayerZoneMap } from "./player-zone-map"

/**
 * The signed-out **player watch view** at `/c/encounter/{shortId}` (UNN-322).
 * Seeds from the server-rendered `initialSnapshot` and then subscribes to the
 * DM's live changes via {@link useEncounterSnapshot} (UNN-323) — the polling is
 * fully inside the hook, so this view just re-renders off whatever snapshot it
 * holds. Strictly read-only: it renders no controls, inputs, or actions. Enemy
 * affinities/attributes are already absent from the snapshot (UNN-324), so there
 * is nothing here to redact.
 *
 * The status fork mirrors the encounter lifecycle: `draft` shows a waiting state,
 * `ended` a concluded banner above the final board, `live` the full tracker.
 */
export function EncounterWatch({
  shortId,
  initialSnapshot,
}: {
  shortId: string
  initialSnapshot: EncounterSnapshot
}) {
  const { snapshot, stale } = useEncounterSnapshot(shortId, initialSnapshot)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      {snapshot.campaignShortId ? (
        <CampaignBackLink campaignShortId={snapshot.campaignShortId} />
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-medium">{snapshot.name}</h1>
        <StatusPill status={snapshot.status} stale={stale} />
      </header>

      {snapshot.status === "draft" ? (
        <WaitingState />
      ) : (
        <Board snapshot={snapshot} ended={snapshot.status === "ended"} />
      )}
    </main>
  )
}

function Board({
  snapshot,
  ended,
}: {
  snapshot: EncounterSnapshot
  ended: boolean
}) {
  const view = resolvePlayerView(snapshot)

  return (
    <div className="flex flex-col gap-6">
      {ended ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          This encounter has concluded. Below is how it ended.
        </p>
      ) : null}
      <PlayerTurnOrder
        round={snapshot.round}
        currentActor={snapshot.currentActor}
        combatants={snapshot.combatants}
      />
      <PlayerZoneMap view={view} />
    </div>
  )
}

function WaitingState() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
      Waiting for the DM to start combat.
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
