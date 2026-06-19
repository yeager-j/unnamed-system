import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { type DungeonSnapshot } from "@workspace/game/engine"

import { DungeonWatch } from "@/components/dungeon/dungeon-watch"
import { auth } from "@/lib/auth"
import {
  getDungeonSnapshot,
  loadOwnedDungeonCharacterIds,
} from "@/lib/db/queries/load-dungeon-snapshot"

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
      ? `${snapshot.name} — Watch — Unnamed System`
      : "Dungeon not found — Unnamed System",
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
 * them. A signed-out spectator resolves to none and sees the map with nothing
 * highlighted — the page stays public.
 */
export default async function DungeonWatchPage({ params }: PageProps) {
  const { shortId } = await params
  const session = await auth()
  const viewerId = session?.user?.id

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
    />
  )
}
