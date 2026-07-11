"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { type DungeonSnapshot } from "@workspace/game-v2/visibility"
import { Badge } from "@workspace/ui/components/badge"
import { Spinner } from "@workspace/ui/components/spinner"

import { useDungeonSnapshot } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_hooks/use-dungeon-snapshot"
import {
  DungeonCombatWatchBody,
  type DungeonWatchCombatData,
} from "@/components/dungeon/combat/watch"
import { DungeonExploreSheetColumn } from "@/components/dungeon/explore-sheet-column"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type { LoadedCharacter } from "@/domain/character/load"
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
 * Refreshes the RSC props once per phase flip (UNN-604). The delve snapshot is
 * the phase authority — `snapshot.combat` appearing or disappearing is what the
 * subscription observes — but each phase needs server-loaded props the other
 * render didn't carry (the combat phase's encounter seed + owner-resolved
 * sheets). This is **prop rehydration, not the fork mechanism**: the surface
 * stays mounted through the refresh, so client state (canvas viewport, open
 * tabs) survives. Each guard is keyed so a flip refreshes exactly once and a
 * later re-flip refreshes again.
 */
function usePhaseFlipRefresh(
  snapshot: DungeonSnapshot,
  combat: DungeonWatchCombatData | null
) {
  const router = useRouter()
  const requestedCombatFor = useRef<string | null>(null)
  const requestedExplore = useRef(false)

  useEffect(() => {
    const live = snapshot.status === "active" ? (snapshot.combat ?? null) : null

    if (live) {
      requestedExplore.current = false
      if (combat?.encounterShortId === live.encounterShortId) return
      if (requestedCombatFor.current === live.encounterShortId) return
      requestedCombatFor.current = live.encounterShortId
      router.refresh()
      return
    }

    requestedCombatFor.current = null
    if (combat !== null && !requestedExplore.current) {
      requestedExplore.current = true
      router.refresh()
    }
  }, [snapshot.status, snapshot.combat, combat, router])
}

/**
 * The signed-out-visible **dungeon player watch** at `/campaigns/{c}/dungeon/{d}/watch`
 * (UNN-466; one surface for both phases since UNN-604). Seeds from the
 * server-rendered redacted `initialSnapshot` and subscribes via
 * {@link useDungeonSnapshot} (realtime + ~1.5s poll fallback).
 *
 * Status-branched: `draft` waits, `active` shows the live fog map, `done`
 * freezes the final reveal. **The phase is read from the snapshot**: while
 * `snapshot.combat` names a live fight (and the page has loaded that fight's
 * props), the body swaps to the {@link DungeonCombatWatchBody} — the same fog
 * board with the redacted combatants joined on — and swaps back when the fight
 * ends. No reload, no server fork: {@link usePhaseFlipRefresh} only rehydrates
 * props.
 *
 * A signed-in viewer with character(s) in the delve also gets the phase's
 * own-sheet column (Explore cards while exploring, the combat sheets in a
 * fight). A spectator has none, so the map takes the full width.
 */
export function DungeonWatch({
  shortId,
  initialSnapshot,
  ownedCharacterIds,
  ownedSheets,
  combat,
}: {
  shortId: string
  initialSnapshot: DungeonSnapshot
  /** The party tokens to self-highlight. Stays the authority for the canvas:
   *  a character whose row fails the load seam still owns its token. */
  ownedCharacterIds: string[]
  /** The viewer's own characters here — empty for a spectator. */
  ownedSheets: LoadedCharacter[]
  /** The live fight's watch data when the page loaded one, else `null`. */
  combat: DungeonWatchCombatData | null
}) {
  const { snapshot, stale, refetch } = useDungeonSnapshot(
    shortId,
    initialSnapshot
  )
  usePhaseFlipRefresh(snapshot, combat)

  const inCombat =
    snapshot.status === "active" &&
    snapshot.combat !== undefined &&
    combat !== null &&
    combat.encounterShortId === snapshot.combat.encounterShortId

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
          {inCombat ? (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive"
            >
              Combat
            </Badge>
          ) : snapshot.status !== "draft" ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              Turn {snapshot.turn}
            </span>
          ) : null}
          <StatusPill status={snapshot.status} stale={stale} />
        </div>
      </header>

      {snapshot.status === "draft" ? (
        <WaitingState />
      ) : inCombat ? (
        <DungeonCombatWatchBody
          key={combat.encounterShortId}
          board={snapshot}
          combat={combat}
          ownedCharacterIds={ownedCharacterIds}
          refetchBoard={refetch}
        />
      ) : (
        <>
          {snapshot.status === "done" ? (
            <p className="border-b bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">
              This delve has wrapped. Below is the map as it was last left.
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {ownedSheets.length > 0 ? (
              <aside
                aria-label="Your characters"
                className="shrink-0 overflow-y-auto border-b px-4 py-4 lg:w-[340px] lg:border-r lg:border-b-0"
              >
                <DungeonExploreSheetColumn characters={ownedSheets} />
              </aside>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1">
              <DungeonWatchCanvas
                snapshot={snapshot}
                ownedCharacterIds={ownedCharacterIds}
                mode={{ kind: "explore" }}
              />
            </div>
          </div>
        </>
      )}
    </main>
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
