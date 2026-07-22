import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { DungeonEncounterStaging } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/encounter-staging"
import { groupZonesByPage } from "@/domain/map/view/page-groups"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-session"
import { dungeonConsolePath } from "@/lib/paths"

import { getDungeonForDM } from "../dungeon-access"

interface PageProps {
  params: Promise<{ campaignShortId: string; shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId, shortId } = await params
  const result = await getDungeonForDM(campaignShortId, shortId)

  return {
    title: result
      ? `Start an encounter — ${result.dungeon.name} — Showtime!`
      : "Dungeon not found — Showtime!",
    robots: { index: false, follow: false },
  }
}

/**
 * The delve's pre-combat staging sub-route (UNN-541): `/campaigns/{c}/dungeon/{d}/setup`.
 * DM-only via {@link getDungeonForDM} (same 404 for missing / not-your-campaign as
 * the console). Only an `active` delve with no fight already running can stage — a
 * draft/done delve, or one whose Instance already carries a live encounter, redirects
 * back to the console, the same gates the dungeon authority enforces on the
 * write. Staging itself is client-only; the mint is one atomic action.
 */
export default async function DungeonEncounterPage({ params }: PageProps) {
  const { campaignShortId, shortId } = await params
  const result = await getDungeonForDM(campaignShortId, shortId)

  if (!result) notFound()
  const { dungeon, instance, placedCharacters, canon } = result

  if (dungeon.status !== "active") {
    redirect(dungeonConsolePath(campaignShortId, shortId))
  }
  if (await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)) {
    redirect(dungeonConsolePath(campaignShortId, shortId))
  }

  const placedIds = new Set(placedCharacters.map((character) => character.id))
  const partyCharacterIds = Object.keys(instance.state.occupancy).filter(
    (characterId) => placedIds.has(characterId)
  )

  const zones = groupZonesByPage(instance.state.geometry).flatMap((group) =>
    group.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      pageId: group.pageId,
      pageName: group.pageName,
    }))
  )

  return (
    <DungeonEncounterStaging
      dungeonId={dungeon.id}
      shortId={shortId}
      campaignShortId={campaignShortId}
      dungeonName={dungeon.name}
      canon={canon}
      partyCharacterIds={partyCharacterIds}
      zones={zones}
    />
  )
}
