"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"

import type {
  DungeonSnapshot,
  SpatialEncounterSnapshot,
} from "@workspace/game-v2/visibility"
import { Spinner } from "@workspace/ui/components/spinner"

import { CombatSheetColumn } from "@/components/combat/watch/combat-sheet-column"
import { useOwnedSheetRefresh } from "@/components/combat/watch/owned-sheet-refresh"
import { PlayerTurnOrder } from "@/components/combat/watch/player-turn-order"
import { WatchEnemiesRail } from "@/components/combat/watch/watch-enemies-rail"
import {
  useEncounterSnapshot,
  type WatchSnapshot,
} from "@/hooks/use-encounter-snapshot"
import { buildWatchView } from "@/lib/combat/view/watch-layout"
import type {
  EncounterSnapshotResult,
  OwnedEncounterSheet,
} from "@/lib/db/queries/load-encounter-snapshot-v2"

// React Flow measures the DOM, so the fog canvas renders client-only against a
// mounted container (the exploration watch + run console load theirs the same way).
const DungeonWatchCanvas = dynamic(
  () =>
    import("@/components/dungeon/canvas/watch/canvas").then(
      (module) => module.DungeonWatchCanvas
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

/** The combat-phase props the watch page loads when the delve snapshot names a
 *  live fight — `null` until the phase-flip refresh pulls them (UNN-604). */
export interface DungeonWatchCombatData {
  encounterShortId: string
  initialSnapshot: SpatialEncounterSnapshot
  initialCompositeVersion: string
  /** The viewer's own combatants here — empty for a spectator. */
  ownedSheets: OwnedEncounterSheet[]
}

/**
 * The delve **combat** player watch (UNN-604) — the C3 composition the spatial
 * projector always intended: the fog map stays the battlefield, and the live
 * fight's redacted combatants join onto it by `zoneId`. Dual-sourced:
 *
 * - the **board** is the `board` prop — the exploration {@link DungeonSnapshot}
 *   the parent {@link import("../watch").DungeonWatch} keeps subscribed, so
 *   mid-combat Zone reveals keep flowing;
 * - the **pieces** come from this component's own {@link useEncounterSnapshot}
 *   subscription to the fight's **fogged** endpoint, so a player never sees
 *   combatants in Zones the DM hasn't revealed (the projector blanks their
 *   `zoneId`; they render in the enemies rail without a location).
 *
 * A viewer who owns combatant(s) gets the shared {@link CombatSheetColumn} on
 * the left — the same owner-mode sheets as the mapless watch. When the fight
 * ends, the encounter subscription stops itself; the parent's dungeon
 * subscription observes `combat` leaving the delve snapshot and swaps this
 * body back to exploration.
 */
export function DungeonCombatWatchBody({
  board,
  combat,
  ownedCharacterIds,
  refetchBoard,
}: {
  board: DungeonSnapshot
  combat: DungeonWatchCombatData
  ownedCharacterIds: string[]
  /** The parent dungeon subscription's guarded refetch — driven from here
   *  because combat writes ping the **encounter** channel, not the dungeon's,
   *  so in realtime mode this subscription is the only thing that hears a
   *  mid-combat move/reveal and the board must be pulled along. */
  refetchBoard: () => void
}) {
  const { snapshot } = useEncounterSnapshot(
    combat.encounterShortId,
    {
      ...combat.initialSnapshot,
      compositeVersion: combat.initialCompositeVersion,
    },
    fetchFoggedSnapshot
  )
  useOwnedSheetRefresh(snapshot, combat.ownedSheets)

  // The shared Instance advanced (a move, a reveal, an enchant) — the pieces
  // just refetched over it, so pull the board through the same guarded apply.
  const lastInstanceVersion = useRef(snapshot.instanceVersion)
  useEffect(() => {
    if (snapshot.instanceVersion === lastInstanceVersion.current) return
    lastInstanceVersion.current = snapshot.instanceVersion
    refetchBoard()
  }, [snapshot.instanceVersion, refetchBoard])

  const view = buildWatchView(snapshot)

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {combat.ownedSheets.length > 0 ? (
        <aside
          aria-label="Your characters"
          className="shrink-0 overflow-y-auto border-b px-4 py-4 lg:w-[340px] lg:border-r lg:border-b-0"
        >
          <CombatSheetColumn
            snapshot={snapshot}
            ownedSheets={combat.ownedSheets}
          />
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {snapshot.status === "ended" ? (
          <p className="border-b bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">
            The fight has wrapped — returning to exploration.
          </p>
        ) : null}
        <div className="shrink-0 p-3">
          <PlayerTurnOrder
            round={snapshot.round}
            currentActor={snapshot.currentActor}
            combatants={view.combatants}
          />
        </div>
        <div className="min-h-0 min-w-0 flex-1">
          <DungeonWatchCanvas
            snapshot={board}
            ownedCharacterIds={ownedCharacterIds}
            mode={{ kind: "combat", combatants: view.combatants }}
          />
        </div>
        {view.enemies.length > 0 ? (
          <WatchEnemiesRail
            enemies={view.enemies}
            zoneNameById={view.zoneNameById}
          />
        ) : null}
      </div>
    </div>
  )
}
