import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { toCombatantSetup } from "@workspace/game/engine"

import { EnemyCatalogBrowser } from "@/components/combat/enemies/enemy-catalog-browser"

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
      ? `Add enemies — ${result.encounter.name} — Unnamed System`
      : "Encounter not found — Unnamed System",
    robots: { index: false, follow: false },
  }
}

/**
 * The catalog browse-and-add sub-route (UNN-346): `/combat/{shortId}/enemies`.
 * DM-only via {@link getEncounterForDM} (same 404 for missing / not-your-campaign
 * as the console). Only a `draft` encounter can take catalog adds — a `live` or
 * `ended` one redirects back to the console, mirroring the console's own status
 * fork. Seeds the browser with the encounter's persisted roster so "Add to
 * encounter" appends to (never replaces) it through the existing setup save path.
 */
export default async function CombatEnemiesPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getEncounterForDM(shortId)

  if (!result) notFound()
  const { encounter, instance } = result
  if (encounter.status !== "draft") redirect(`/combat/${shortId}`)

  return (
    <EnemyCatalogBrowser
      encounterId={encounter.id}
      shortId={shortId}
      encounterName={encounter.name}
      expectedVersion={encounter.version}
      expectedInstanceVersion={instance.version}
      existingCombatants={encounter.session.combatants.map((combatant) =>
        toCombatantSetup(combatant, instance.state.occupancy[combatant.id])
      )}
    />
  )
}
