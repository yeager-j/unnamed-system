import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getEncounterForDM } from "@/app/combat/[shortId]/encounter-access"
import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonPrep, type PrepZone } from "@/components/dungeon/prep"
import {
  DungeonRunConsole,
  type DungeonRunMode,
} from "@/components/dungeon/run-console"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCombatConsoleDataV2 } from "@/lib/db/queries/load-combat-console-data-v2"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-v2"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadPartyVitalsByIds } from "@/lib/db/queries/load-party-vitals"

import { getDungeonForDM, type DungeonForDM } from "./dungeon-access"

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
      ? `${result.dungeon.name} — Showtime!`
      : "Dungeon not found — Showtime!",
  }
}

/**
 * The DM dungeon console at `/dungeon/{shortId}` (UNN-462/464), DM-only. Loads
 * through {@link getDungeonForDM} (404s for a non-DM without leaking existence),
 * then **status-forks** like the combat console: `draft` → the prep view (stage
 * the roster, snapshot + start), `active` → the run console (canvas + turn loop),
 * `done` → a frozen summary. The delve roster's display names/portraits come from
 * the campaign's placed characters (exploration needs no full sheet hydration —
 * that is combat's, M4).
 */
export default async function DungeonPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getDungeonForDM(shortId)

  if (!result) notFound()
  const { dungeon, instance } = result

  const campaign = await loadCampaignRowById(dungeon.campaignId)
  const campaignShortId = campaign?.shortId ?? ""

  const placedCharacters = await loadPlacedCharactersForCampaign(
    dungeon.campaignId
  )

  switch (dungeon.status) {
    case "draft": {
      // Zones come from the source template — the Instance is blank until start.
      const map = instance.mapId ? await loadMapRowById(instance.mapId) : null
      const zones: PrepZone[] = map
        ? Object.values(map.geometry.zones).map((zone) => ({
            id: zone.id,
            name: zone.name,
          }))
        : []
      return (
        <DungeonPrep
          dungeon={dungeon}
          instance={instance}
          placedCharacters={placedCharacters}
          zones={zones}
          campaignShortId={campaignShortId}
        />
      )
    }

    case "active": {
      // The combat-vs-explore distinction, decided once here: a live encounter on
      // the delve's Instance means the fight phase (UNN-536); else exploration.
      const mode = await resolveRunMode(dungeon, instance, placedCharacters)
      return (
        <DungeonRunConsole
          dungeon={dungeon}
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
 * hydrate each placed PC once for its token's HP/SP bars (UNN-489).
 */
async function resolveRunMode(
  dungeon: DungeonForDM["dungeon"],
  instance: DungeonForDM["instance"],
  placedCharacters: Awaited<ReturnType<typeof loadPlacedCharactersForCampaign>>
): Promise<DungeonRunMode> {
  const live = await loadLiveEncounterForMapInstance(dungeon.mapInstanceId)
  if (live) {
    const data = await getEncounterForDM(live.shortId)
    if (data) {
      const combatantSheetSliceById = await loadCombatConsoleDataV2(
        data.session,
        data.instance.state,
        data.participantMeta
      )
      return { kind: "combat", data, combatantSheetSliceById }
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
