import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import {
  type DungeonSnapshot,
  type SpatialEncounterSnapshot,
} from "@workspace/game-v2/visibility"

import { DungeonCombatWatch } from "@/components/dungeon/combat/watch"
import { DungeonWatch } from "@/components/dungeon/watch"
import { auth } from "@/lib/auth"
import { loadCharactersByIds } from "@/lib/character/load"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import {
  getDungeonSnapshot,
  loadOwnedDungeonCharacterIds,
} from "@/lib/db/queries/load-dungeon-snapshot"
import {
  getDungeonCombatSnapshot,
  loadOwnedEncounterSheets,
  type OwnedEncounterSheet,
} from "@/lib/db/queries/load-encounter-snapshot-v2"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-v2"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized snapshot lookup shared by `generateMetadata` and the page
 *  (its `loadDungeonRowByShortId` read is itself fast). */
const getSnapshot = cache(
  async (shortId: string): Promise<DungeonSnapshot | null> =>
    getDungeonSnapshot(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const snapshot = await getSnapshot(shortId)

  return {
    title: snapshot
      ? `${snapshot.name} — Watch — Showtime!`
      : "Dungeon not found — Showtime!",
  }
}

/**
 * The signed-out-visible **dungeon fog player view** at `/c/dungeon/{shortId}`
 * (UNN-466, ADR — *Player view: redaction & snapshot*). The server loads the
 * server-**redacted** {@link DungeonSnapshot} (DM notes / undiscovered Zones /
 * unrevealed connections stripped in {@link getDungeonSnapshot}) and hands it to
 * the client {@link DungeonWatch}, which polls for the DM's live changes. No auth
 * guard — the fog view is intentionally public; a missing `shortId` 404s.
 *
 * It *also* resolves the signed-in viewer (`auth()`) to the party token(s) they own
 * in this delve ({@link loadOwnedDungeonCharacterIds}) so the view can self-highlight
 * them — and loads those characters' sheets for the watch's own-sheet Explore column
 * (UNN-566). A signed-out spectator resolves to none and sees the map with nothing
 * highlighted and no column — the page stays public.
 */
interface DungeonCombatWatchData {
  encounterShortId: string
  initialSnapshot: SpatialEncounterSnapshot
  initialCompositeVersion: string
  ownedSheets: OwnedEncounterSheet[]
}

/**
 * The fogged combat-watch data when a live fight runs on this delve's Instance,
 * else `null` — the combat-vs-explore fork resolved **once**, off the page's flat
 * happy path (UNN-536). Each precondition is a guard clause; a live row that can't
 * project is a data-integrity failure that resolves to `null`, so the page falls
 * back to the exploration view rather than 404 the whole delve.
 */
async function resolveDungeonCombatWatch(
  shortId: string,
  viewerId: string | undefined
): Promise<DungeonCombatWatchData | null> {
  const dungeon = await loadDungeonRowByShortId(shortId)
  if (!dungeon) return null

  const live = await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)
  if (!live) return null

  const snapshotResult = await getDungeonCombatSnapshot(live.shortId)
  if (!snapshotResult.ok) return null

  return {
    encounterShortId: live.shortId,
    initialSnapshot: snapshotResult.value.snapshot,
    initialCompositeVersion: snapshotResult.value.compositeVersion,
    ownedSheets: viewerId
      ? await loadOwnedEncounterSheets(live.shortId, viewerId)
      : [],
  }
}

export default async function DungeonWatchPage({ params }: PageProps) {
  const { shortId } = await params
  const session = await auth()
  const viewerId = session?.user?.id

  // The combat-vs-explore fork, decided once: a live encounter on the delve's
  // Instance composes the **fogged** v2 combat watch (UNN-536); else the
  // exploration fog view below stays the flat happy path.
  const combat = await resolveDungeonCombatWatch(shortId, viewerId)
  if (combat) return <DungeonCombatWatch {...combat} />

  const [snapshot, ownedCharacterIds] = await Promise.all([
    getSnapshot(shortId),
    viewerId
      ? loadOwnedDungeonCharacterIds(shortId, viewerId)
      : Promise.resolve([]),
  ])
  if (!snapshot) notFound()

  return (
    <DungeonWatch
      shortId={shortId}
      initialSnapshot={snapshot}
      ownedCharacterIds={ownedCharacterIds}
      ownedSheets={await loadCharactersByIds(ownedCharacterIds)}
    />
  )
}
