import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { type DungeonSnapshot } from "@workspace/game-v2/visibility"

import type { DungeonWatchCombatData } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/watch"
import { DungeonWatch } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/watch"
import { loadCharactersByIds, toCharacterMount } from "@/domain/character/load"
import { auth } from "@/lib/auth"
import {
  getDungeonSnapshot,
  loadOwnedDungeonCharacterIds,
} from "@/lib/db/queries/load-dungeon-snapshot"
import {
  getDungeonCombatSnapshot,
  loadOwnedEncounterSheets,
} from "@/lib/db/queries/load-encounter-snapshot"

interface PageProps {
  params: Promise<{ campaignShortId: string; shortId: string }>
}

/** Per-request memoized snapshot lookup shared by `generateMetadata` and the page
 *  (its `loadDungeonRowByShortId` read is itself fast). The `campaignShortId`
 *  pairing check 404s a watch URL whose campaign doesn't own this delve. */
const getSnapshot = cache(
  async (
    campaignShortId: string,
    shortId: string
  ): Promise<DungeonSnapshot | null> =>
    getDungeonSnapshot(shortId, campaignShortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId, shortId } = await params
  const snapshot = await getSnapshot(campaignShortId, shortId)

  return {
    title: snapshot
      ? `${snapshot.name} — Watch — Showtime!`
      : "Dungeon not found — Showtime!",
  }
}

/**
 * The live fight's watch data when the delve snapshot names one (UNN-604): the
 * fogged combat seed + the viewer's owner-resolved sheets. A live linkage whose
 * snapshot can't project is a data-integrity failure that resolves to `null` —
 * the watch stays on the exploration view rather than 404 the whole delve.
 */
async function loadCombatWatchData(
  encounterShortId: string,
  campaignShortId: string,
  viewerId: string | undefined
): Promise<DungeonWatchCombatData | null> {
  const snapshotResult = await getDungeonCombatSnapshot(
    encounterShortId,
    campaignShortId
  )
  if (!snapshotResult.ok) return null

  return {
    encounterShortId,
    initialSnapshot: snapshotResult.value.snapshot,
    initialCompositeVersion: snapshotResult.value.compositeVersion,
    ownedSheets: viewerId
      ? await loadOwnedEncounterSheets(encounterShortId, viewerId)
      : [],
  }
}

/**
 * The signed-out-visible **dungeon player watch** at `/campaigns/{c}/dungeon/{d}/watch`
 * (UNN-466, ADR — *Player view: redaction & snapshot*). The server loads the
 * server-**redacted** {@link DungeonSnapshot} (DM notes / undiscovered Zones /
 * unrevealed connections stripped in {@link getDungeonSnapshot}) and hands it to
 * the client {@link DungeonWatch}, which polls for the DM's live changes. No auth
 * guard — the fog view is intentionally public; a missing `shortId` 404s.
 *
 * **One surface, both phases** (UNN-604): there is no combat-vs-explore render
 * fork here. The snapshot's `combat` linkage decides what *extra* props load —
 * the fogged fight seed + owner-resolved combat sheets — and the client swaps
 * bodies as the linkage appears/disappears, `router.refresh()`ing only to pull
 * the other phase's props.
 *
 * It *also* resolves the signed-in viewer (`auth()`) to the party token(s) they
 * own in this delve ({@link loadOwnedDungeonCharacterIds}) so the view can
 * self-highlight them — and loads those characters' sheets for the watch's
 * own-sheet Explore column (UNN-566). A signed-out spectator resolves to none
 * and sees the map with nothing highlighted and no column — the page stays
 * public.
 */
export default async function DungeonWatchPage({ params }: PageProps) {
  const { campaignShortId, shortId } = await params
  const session = await auth()
  const viewerId = session?.user?.id

  const [snapshot, ownedCharacterIds] = await Promise.all([
    getSnapshot(campaignShortId, shortId),
    viewerId
      ? loadOwnedDungeonCharacterIds(shortId, viewerId)
      : Promise.resolve([]),
  ])
  if (!snapshot) notFound()

  const [ownedSheets, combat] = await Promise.all([
    loadCharactersByIds(ownedCharacterIds).then((characters) =>
      characters.map(toCharacterMount)
    ),
    snapshot.combat
      ? loadCombatWatchData(
          snapshot.combat.encounterShortId,
          campaignShortId,
          viewerId
        )
      : Promise.resolve(null),
  ])

  return (
    <DungeonWatch
      shortId={shortId}
      initialSnapshot={snapshot}
      ownedCharacterIds={ownedCharacterIds}
      ownedSheets={ownedSheets}
      combat={combat}
    />
  )
}
