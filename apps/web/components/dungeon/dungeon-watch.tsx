"use client"

import dynamic from "next/dynamic"

import { type DungeonSnapshot } from "@workspace/game/engine"
import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/combat/campaign-back-link"
import { useDungeonSnapshot } from "@/hooks/use-dungeon-snapshot"
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
 * (UNN-466). Seeds from the server-rendered redacted `initialSnapshot` and polls
 * for the DM's live changes via {@link useDungeonSnapshot} (realtime is UNN-468).
 *
 * Status-branched like the encounter watch: `draft` waits, `active` shows the live
 * fog map, `done` freezes the final reveal under a concluded banner. During
 * exploration the only temporal signal is the **turn counter** — no turn queue, no
 * acted-flags (those stay DM-only). The viewer's own party token(s) self-highlight
 * (`ownedCharacterIds`); a spectator sees the map with none highlighted.
 */
export function DungeonWatch({
  shortId,
  initialSnapshot,
  ownedCharacterIds,
}: {
  shortId: string
  initialSnapshot: DungeonSnapshot
  ownedCharacterIds: string[]
}) {
  const { snapshot, stale } = useDungeonSnapshot(shortId, initialSnapshot)

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
