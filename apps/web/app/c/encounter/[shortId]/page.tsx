import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { loadEncounterRowByShortId } from "@/lib/db/queries/load-encounter"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { ENCOUNTER_STATUS_LABELS } from "@/lib/ui/labels"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized encounter lookup shared by `generateMetadata` and the
 *  page. */
const getEncounter = cache(
  async (shortId: string): Promise<EncounterRow | null> =>
    loadEncounterRowByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const encounter = await getEncounter(shortId)

  return {
    title: encounter
      ? `${encounter.name} — Watch — Unnamed System`
      : "Encounter not found — Unnamed System",
  }
}

/**
 * The signed-out-visible **player watch view** at `/c/encounter/{shortId}` (ADR
 * Decision 5). This is the **route shell only** (UNN-329): it resolves the
 * encounter by its public `shortId` and renders a placeholder. The live snapshot
 * projection — turn order, zones, PC/enemy vitals with enemy affinities stripped —
 * is UNN-334's job; the campaign overview and the live-combat banner link here so
 * the navigation exists before that rendering lands.
 */
export default async function EncounterWatchPage({ params }: PageProps) {
  const { shortId } = await params
  const encounter = await getEncounter(shortId)
  if (!encounter) notFound()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium">{encounter.name}</h1>
        <p className="text-sm text-muted-foreground">
          {ENCOUNTER_STATUS_LABELS[encounter.status]}
        </p>
      </header>
      <div
        className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
        data-testid="encounter-watch-stub"
      >
        The live combat view is coming soon.
      </div>
    </main>
  )
}
