"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import {
  type DungeonSnapshot,
  type EncounterSnapshot,
} from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/combat/campaign-back-link"
import { WatchSheetColumn } from "@/components/combat/watch-sheet-column"
import { useOwnedSheetZoneEffectsRefresh } from "@/components/combat/watch-sheet-refresh"
import { useDungeonSnapshot } from "@/hooks/use-dungeon-snapshot"
import { useEncounterSnapshot } from "@/hooks/use-encounter-snapshot"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot"
import { DUNGEON_STATUS_LABELS } from "@/lib/ui/labels"

// React Flow measures the DOM, so the fog canvas renders client-only against a
// mounted container (the run console + template editor lazy-load their canvases
// the same way).
const DungeonFogCanvas = dynamic(
  () =>
    import("./canvas/dungeon-fog-canvas").then(
      (module) => module.DungeonFogCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    ),
  }
)

/**
 * The signed-out-visible **dungeon fog player view** at `/c/dungeon/{shortId}`
 * (UNN-466 / UNN-467). Seeds from the server-rendered redacted `initialSnapshot`
 * and subscribes via {@link useDungeonSnapshot} (realtime + ~1.5s poll fallback).
 *
 * Status-branched like the encounter watch: `draft` waits, `active` shows the live
 * fog map, `done` freezes the final reveal. **While a fight runs on the delve**
 * (`snapshot.combat`) it morphs into the combat composition (UNN-467, AC8): it
 * **dual-subscribes** to the live encounter channel so DM combat moves refresh the
 * fog board over realtime, shows a "Combat — Round N · {actor}" signal, and — for a
 * viewer who owns combatant(s) here — composes the encounter watch's own-sheet
 * column beside the map (the map stays the battlefield). PC-vitals push live for
 * free: each owned sheet's {@link import("@/hooks/use-character").CharacterProvider}
 * already subscribes to its character channel (AC9).
 */
export function DungeonWatch({
  shortId,
  initialSnapshot,
  ownedCharacterIds,
  initialEncounterSnapshot,
  ownedSheets,
}: {
  shortId: string
  initialSnapshot: DungeonSnapshot
  ownedCharacterIds: string[]
  initialEncounterSnapshot: EncounterSnapshot | null
  ownedSheets: OwnedEncounterSheet[]
}) {
  const router = useRouter()
  const { snapshot, stale, refetch } = useDungeonSnapshot(
    shortId,
    initialSnapshot
  )
  const combat = snapshot.combat

  // Mid-session combat start: the dungeon snapshot flipped into combat (its shared
  // Instance bumped, surfacing `combat`) but our RSC props — the encounter snapshot
  // + owned sheets the column needs — predate it. Pull them once. On combat end the
  // guard resets so a later fight refreshes again.
  const refreshedForCombat = useRef(false)
  useEffect(() => {
    if (combat && !initialEncounterSnapshot && !refreshedForCombat.current) {
      refreshedForCombat.current = true
      router.refresh()
    }
    if (!combat) refreshedForCombat.current = false
  }, [combat, initialEncounterSnapshot, router])

  const hasOwnSheets =
    ownedSheets.length > 0 && initialEncounterSnapshot !== null

  return (
    <main className="flex h-[calc(100svh-3.5rem)] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {snapshot.campaignShortId ? (
            <CampaignBackLink campaignShortId={snapshot.campaignShortId} />
          ) : null}
          <h1 className="truncate font-heading text-xl font-medium">
            {snapshot.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {combat ? (
            <Badge variant="secondary" className="gap-1 tabular-nums">
              Combat — Round {combat.round}
              {combat.currentActorName ? ` · ${combat.currentActorName}` : ""}
            </Badge>
          ) : snapshot.status !== "draft" ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              Turn {snapshot.turn}
            </span>
          ) : null}
          <StatusPill status={snapshot.status} stale={stale} />
        </div>
      </header>

      {combat ? (
        <RealtimeChannelListener
          domain="encounter"
          shortId={combat.encounterShortId}
          onPing={() => refetch()}
        />
      ) : null}

      {snapshot.status === "draft" ? (
        <WaitingState />
      ) : combat && hasOwnSheets ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
          <div className="min-w-0 border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <CombatSheetColumn
              encounterShortId={combat.encounterShortId}
              initialEncounterSnapshot={initialEncounterSnapshot}
              ownedSheets={ownedSheets}
            />
          </div>
          <div className="min-h-0 lg:col-span-2">
            <DungeonFogCanvas
              snapshot={snapshot}
              ownedCharacterIds={ownedCharacterIds}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {snapshot.status === "done" ? (
            <p className="border-b bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">
              This delve has wrapped. Below is the map as it was last left.
            </p>
          ) : null}
          <div className="min-h-0 flex-1">
            <DungeonFogCanvas
              snapshot={snapshot}
              ownedCharacterIds={ownedCharacterIds}
            />
          </div>
        </div>
      )}
    </main>
  )
}

/**
 * The own-sheet column during dungeon combat — it owns a live
 * {@link useEncounterSnapshot} subscription (the combatant overlay + round the
 * shared {@link WatchSheetColumn} renders), so the player manages their session
 * conditions in place exactly as on the encounter watch. Mounted only when the
 * viewer owns combatant(s) here, so the encounter subscription is paid only by
 * those who need it.
 */
function CombatSheetColumn({
  encounterShortId,
  initialEncounterSnapshot,
  ownedSheets,
}: {
  encounterShortId: string
  initialEncounterSnapshot: EncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  const { snapshot } = useEncounterSnapshot(
    encounterShortId,
    initialEncounterSnapshot
  )
  // The live encounter snapshot feeds the column's read-only condition display
  // and keeps the owned sheets' skill scaling fresh when a Zone Enchantment changes.
  useOwnedSheetZoneEffectsRefresh(snapshot, ownedSheets)

  return <WatchSheetColumn snapshot={snapshot} ownedSheets={ownedSheets} />
}

function WaitingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="flex min-h-64 w-full items-center justify-center border border-dashed p-12 text-center text-sm text-muted-foreground">
        The delve hasn&apos;t begun. Hang tight — the map appears once the DM
        starts exploring.
      </div>
    </div>
  )
}

/** The delve's status, with a subtle "Reconnecting…" hint when a poll has failed
 *  but the last good snapshot is still shown. */
function StatusPill({
  status,
  stale,
}: {
  status: DungeonSnapshot["status"]
  stale: boolean
}) {
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      {stale ? <span className="text-xs">Reconnecting…</span> : null}
      <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
        {DUNGEON_STATUS_LABELS[status]}
      </span>
    </span>
  )
}
