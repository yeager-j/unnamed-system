import type { Metadata } from "next"
import { notFound } from "next/navigation"

import type { DungeonRosterEntry } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import {
  DungeonPrep,
  type PrepZone,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/prep"
import {
  DungeonRunConsole,
  type DungeonRunMode,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/run-console"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { getEncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { groupZonesByPage } from "@/domain/map/view/page-groups"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-session"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadPartyVitalsByIds } from "@/lib/db/queries/load-party-vitals"

import { getDungeonForDM, type DungeonForDM } from "./dungeon-access"

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
      ? `${result.dungeon.name} — Showtime!`
      : "Dungeon not found — Showtime!",
  }
}

/**
 * The DM dungeon console at `/campaigns/{c}/dungeon/{d}` (UNN-462/464), DM-only.
 * Loads through {@link getDungeonForDM} (404s for a non-DM without leaking existence),
 * then **status-forks** like the combat console: `draft` → the prep view (stage
 * the roster, snapshot + start), `active` → the run console (canvas + turn loop),
 * `done` → a frozen summary. The delve roster's display names/portraits come from
 * the campaign's placed characters (exploration needs no full sheet hydration —
 * that is combat's, M4).
 */
export default async function DungeonPage({ params }: PageProps) {
  const { campaignShortId, shortId } = await params
  const result = await getDungeonForDM(campaignShortId, shortId)

  if (!result) notFound()
  const { dungeon, instance, placedCharacters, canon } = result

  switch (dungeon.status) {
    case "draft": {
      // Zones come from the source template — the Instance is blank until start.
      const map = instance.mapId ? await loadMapRowById(instance.mapId) : null
      const zones: PrepZone[] = map
        ? groupZonesByPage(map.geometry).flatMap((group) =>
            group.zones.map((zone) => ({
              id: zone.id,
              name: zone.name,
              pageId: group.pageId,
              pageName: group.pageName,
            }))
          )
        : []
      return (
        <DungeonPrep
          dungeon={dungeon}
          canon={canon}
          placedCharacters={placedCharacters}
          zones={zones}
          campaignShortId={campaignShortId}
        />
      )
    }

    case "active": {
      // The combat-vs-explore distinction, decided once here: a live encounter on
      // the delve's Instance means the fight phase (UNN-536); else exploration.
      const mode = await resolveRunMode(
        campaignShortId,
        dungeon,
        instance,
        placedCharacters
      )
      return (
        <DungeonRunConsole
          dungeon={dungeon}
          canon={canon}
          campaignShortId={campaignShortId}
          mode={mode}
        />
      )
    }

    case "done":
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
          {campaignShortId ? (
            <CampaignBackLink campaignShortId={campaignShortId} />
          ) : null}
          <header>
            <h1 className="font-heading text-lg font-medium">{dungeon.name}</h1>
            <p className="text-sm text-muted-foreground">Delve · complete</p>
          </header>
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            This delve has wrapped. The party explored{" "}
            {dungeon.state.turnCounter}{" "}
            {dungeon.state.turnCounter === 1 ? "turn" : "turns"}.
          </div>
        </main>
      )
  }
}

/**
 * Resolves the active delve's run mode — the single combat-vs-explore fork. A live
 * encounter on the delve's Map Instance means combat (UNN-536): resolve the full
 * {@link getEncounterForDM} view + its drawer hydration. Otherwise exploration:
 * hydrate each placed PC once for its token's HP/SP bars (UNN-489). The live
 * encounter shares the delve's campaign, so the URL's `campaignShortId` pairs it.
 */
async function resolveRunMode(
  campaignShortId: string,
  dungeon: DungeonForDM["dungeon"],
  instance: DungeonForDM["instance"],
  placedCharacters: DungeonForDM["placedCharacters"]
): Promise<DungeonRunMode> {
  const live = await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)
  if (live) {
    const data = await getEncounterForDM(
      campaignShortId,
      live.shortId,
      dungeon.id
    )
    if (data) {
      return {
        kind: "combat",
        data,
        combatantSheetSliceById: data.combatantSheetSliceById,
      }
    }
    // A live row we can't resolve for the DM is a data-integrity failure; fall
    // through to exploration rather than 404 the whole delve.
  }

  const vitalsById = await loadPartyVitalsByIds(
    placedCharacters.map((character) => character.id)
  )
  const roster: Record<string, DungeonRosterEntry> = Object.fromEntries(
    placedCharacters.map((character) => [
      character.id,
      {
        name: character.name,
        portraitUrl: character.portraitUrl,
        ...vitalsById.get(character.id),
      },
    ])
  )
  return { kind: "explore", instance, roster, placedCharacters }
}
