import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { EncounterWatch } from "@/components/encounter/encounter-watch"
import { auth } from "@/lib/auth"
import {
  getEncounterSnapshot,
  loadOwnedEncounterSheets,
  type EncounterSnapshotResult,
} from "@/lib/db/queries/load-encounter-snapshot-v2"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized snapshot lookup shared by `generateMetadata` and the
 *  page (its row read is itself React-cached inside the query). */
const getSnapshot = cache(
  async (shortId: string): Promise<EncounterSnapshotResult | null> => {
    const result = await getEncounterSnapshot(shortId)
    return result.ok ? result.value : null
  }
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const result = await getSnapshot(shortId)

  return {
    title: result
      ? `${result.snapshot.name} — Watch — Showtime!`
      : "Encounter not found — Showtime!",
  }
}

/**
 * The signed-out-visible **player watch view** at `/c/encounter/{shortId}` (ADR
 * Decision 5; UNN-322 → UNN-535 on v2). The server loads the **redacted**
 * spatial snapshot through the v2 read boundary — `deriveViewer` decides each
 * component's visibility per relationship, so a spectator's enemies carry no
 * attributes/affinities keys at all — and hands it to the client
 * {@link EncounterWatch} together with the composite version its
 * invalidation equality-compares. No auth guard — the watch view is
 * intentionally public; a missing `shortId` (or an unparseable row) 404s
 * rather than erroring.
 *
 * It *also* resolves the signed-in viewer to the combatants they own here
 * ({@link loadOwnedEncounterSheets}, UNN-566) so the watch can render their
 * own-sheet column. A signed-out spectator owns none and sees the full-width
 * battlefield — the page stays public.
 */
export default async function EncounterWatchPage({ params }: PageProps) {
  const { shortId } = await params
  const session = await auth()
  const viewerId = session?.user?.id

  const [result, ownedSheets] = await Promise.all([
    getSnapshot(shortId),
    viewerId
      ? loadOwnedEncounterSheets(shortId, viewerId)
      : Promise.resolve([]),
  ])
  if (!result) notFound()

  return (
    <EncounterWatch
      shortId={shortId}
      initialSnapshot={result.snapshot}
      initialCompositeVersion={result.compositeVersion}
      ownedSheets={ownedSheets}
    />
  )
}
