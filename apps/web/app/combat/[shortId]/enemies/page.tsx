import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { EnemyCatalogBrowser } from "@/components/encounter/enemy-catalog-browser"

import { getEncounterForDM } from "../encounter-access"

interface PageProps {
  params: Promise<{ shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const result = await getEncounterForDM(shortId)

  return {
    title: result
      ? `Add enemies — ${result.encounter.name} — Showtime!`
      : "Encounter not found — Showtime!",
    robots: { index: false, follow: false },
  }
}

/**
 * The catalog browse-and-add sub-route (UNN-346): `/combat/{shortId}/enemies`.
 * DM-only via {@link getEncounterForDM} (same 404 for missing / not-your-campaign
 * as the console). Only a `draft` encounter can take catalog adds — a `live` or
 * `ended` one redirects back to the console. The commit is the v2 bulk add
 * (`addCatalogEnemiesAction`, session-only — no Instance token), so the browser
 * needs only the roster's side counts for its header summary.
 */
export default async function CombatEnemiesPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getEncounterForDM(shortId)

  if (!result) notFound()
  const { encounter, session } = result
  if (encounter.status !== "draft") redirect(`/combat/${shortId}`)

  const sides = session.participants.map(
    (participant) => participant.overlay.allegiance.side
  )

  return (
    <EnemyCatalogBrowser
      encounterId={encounter.id}
      shortId={shortId}
      encounterName={encounter.name}
      expectedVersion={encounter.version}
      committedPlayers={sides.filter((side) => side === "players").length}
      committedEnemies={sides.filter((side) => side === "enemies").length}
    />
  )
}
