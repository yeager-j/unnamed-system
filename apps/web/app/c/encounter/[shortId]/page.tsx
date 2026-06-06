import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import type { EncounterSnapshot } from "@workspace/game/encounter"

import { EncounterWatch } from "@/components/combat/encounter-watch"
import { getEncounterSnapshot } from "@/lib/db/queries/load-encounter-snapshot"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized snapshot lookup shared by `generateMetadata` and the
 *  page (its `loadEncounterRowByShortId` read is itself React-cached). */
const getSnapshot = cache(
  async (shortId: string): Promise<EncounterSnapshot | null> =>
    getEncounterSnapshot(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const snapshot = await getSnapshot(shortId)

  return {
    title: snapshot
      ? `${snapshot.name} — Watch — Unnamed System`
      : "Encounter not found — Unnamed System",
  }
}

/**
 * The signed-out-visible **player watch view** at `/c/encounter/{shortId}` (ADR
 * Decision 5; UNN-322). The server loads the **redacted** {@link EncounterSnapshot}
 * (enemy affinities/attributes stripped server-side — UNN-324) and hands it to the
 * client {@link EncounterWatch}, which polls for the DM's live changes (UNN-323).
 * No auth guard — the watch view is intentionally public; a missing `shortId`
 * 404s rather than erroring.
 */
export default async function EncounterWatchPage({ params }: PageProps) {
  const { shortId } = await params
  const snapshot = await getSnapshot(shortId)
  if (!snapshot) notFound()

  return <EncounterWatch shortId={shortId} initialSnapshot={snapshot} />
}
