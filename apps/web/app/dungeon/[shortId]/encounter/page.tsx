import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { DungeonEncounterStaging } from "@/components/dungeon/combat/encounter-staging"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-v2"

import { getDungeonForDM } from "../dungeon-access"

interface PageProps {
  params: Promise<{ shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const result = await getDungeonForDM(shortId)

  return {
    title: result
      ? `Start an encounter — ${result.dungeon.name} — Showtime!`
      : "Dungeon not found — Showtime!",
    robots: { index: false, follow: false },
  }
}

/**
 * The delve's pre-combat staging sub-route (UNN-541): `/dungeon/{shortId}/encounter`.
 * DM-only via {@link getDungeonForDM} (same 404 for missing / not-your-campaign as
 * the console). Only an `active` delve with no fight already running can stage — a
 * draft/done delve, or one whose Instance already carries a live encounter, redirects
 * back to the console, the same gates `startDungeonEncounterAction` enforces on the
 * write. Staging itself is client-only; the mint is one atomic action.
 */
export default async function DungeonEncounterPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getDungeonForDM(shortId)

  if (!result) notFound()
  const { dungeon, instance } = result

  if (dungeon.status !== "active") redirect(`/dungeon/${shortId}`)
  if (await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)) {
    redirect(`/dungeon/${shortId}`)
  }

  const placedCharacters = await loadPlacedCharactersForCampaign(
    dungeon.campaignId
  )
  const placedIds = new Set(placedCharacters.map((character) => character.id))
  const partyCharacterIds = Object.keys(instance.state.occupancy).filter(
    (characterId) => placedIds.has(characterId)
  )

  const zones = Object.values(instance.state.geometry.zones).map((zone) => ({
    id: zone.id,
    name: zone.name,
  }))

  return (
    <DungeonEncounterStaging
      dungeonId={dungeon.id}
      shortId={shortId}
      dungeonName={dungeon.name}
      expectedInstanceVersion={instance.version}
      partyCharacterIds={partyCharacterIds}
      zones={zones}
    />
  )
}
