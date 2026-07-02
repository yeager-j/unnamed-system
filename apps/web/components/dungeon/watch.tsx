"use client"

import dynamic from "next/dynamic"
import { type ReactNode } from "react"

import { type DungeonSnapshot } from "@workspace/game/engine"
import { type HydratedCharacter } from "@workspace/game/foundation"
import { Spinner } from "@workspace/ui/components/spinner"

import { DungeonExploreSheetColumn } from "@/components/dungeon/explore-sheet-column"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { useDungeonSnapshot } from "@/hooks/use-dungeon-snapshot"
import { DUNGEON_STATUS_LABELS } from "@/lib/ui/labels"

// React Flow measures the DOM, so the fog canvas renders client-only against a
// mounted container (the run console + template editor lazy-load their canvases
// the same way).
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

/**
 * The signed-out-visible **dungeon fog player view** at `/c/dungeon/{shortId}`
 * (UNN-466). Seeds from the server-rendered redacted `initialSnapshot` and
 * subscribes via {@link useDungeonSnapshot} (realtime + ~1.5s poll fallback).
 *
 * Status-branched: `draft` waits, `active` shows the live fog map, `done` freezes
 * the final reveal. Exploration-only since the v1 combat cutover (UNN-535) — the
 * combat composition (dual-subscribe + own-sheet combat column) returns with
 * dungeon combat on engine v2 (PR11d).
 */
export function DungeonWatch({
  shortId,
  initialSnapshot,
  ownedCharacterIds,
  exploreSheets,
}: {
  shortId: string
  initialSnapshot: DungeonSnapshot
  ownedCharacterIds: string[]
  /** The viewer's own hydrated sheets for the exploration Explore column, shown
   *  beside the map. `[]` for a spectator. */
  exploreSheets: HydratedCharacter[]
}) {
  const { snapshot, stale } = useDungeonSnapshot(shortId, initialSnapshot)

  const fogCanvas = (
    <DungeonWatchCanvas
      snapshot={snapshot}
      ownedCharacterIds={ownedCharacterIds}
    />
  )

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
          {snapshot.status !== "draft" ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              Turn {snapshot.turn}
            </span>
          ) : null}
          <StatusPill status={snapshot.status} stale={stale} />
        </div>
      </header>

      {snapshot.status === "draft" ? (
        <WaitingState />
      ) : (
        <>
          {snapshot.status === "done" ? (
            <p className="border-b bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">
              This delve has wrapped. Below is the map as it was last left.
            </p>
          ) : null}
          {exploreSheets.length > 0 ? (
            <WatchSplit canvas={fogCanvas}>
              <DungeonExploreSheetColumn characters={exploreSheets} />
            </WatchSplit>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">{fogCanvas}</div>
          )}
        </>
      )}
    </main>
  )
}

/**
 * The watch's split layout while a viewer has their own sheet(s) to show: the
 * sheet column (scrolling on its own at `lg`) beside the fog map (2/3).
 */
function WatchSplit({
  children,
  canvas,
}: {
  children: ReactNode
  canvas: ReactNode
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
      <div className="min-w-0 border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        {children}
      </div>
      <div className="min-h-0 lg:col-span-2">{canvas}</div>
    </div>
  )
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
