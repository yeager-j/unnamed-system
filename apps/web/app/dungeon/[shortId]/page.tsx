import type { Metadata } from "next"
import { notFound } from "next/navigation"

import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonPrep, type PrepZone } from "@/components/dungeon/prep"
import { DungeonRunConsole } from "@/components/dungeon/run-console"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { loadMapRowById } from "@/lib/db/queries/load-map"

import { getDungeonForDM } from "./dungeon-access"

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
      // Exploration hydrates each placeable PC once, for the exploration tokens'
      // HP/SP bars (UNN-489). Dungeon combat returns in PR11d.
      const hydratedParty = (
        await Promise.all(
          placedCharacters.map((character) =>
            loadHydratedCharacterById(character.id)
          )
        )
      ).filter((character) => character !== null)
      const vitalsById = new Map(
        hydratedParty.map((character) => [
          character.id,
          {
            hp: { current: character.currentHP, max: character.maxHP },
            sp: { current: character.currentSP, max: character.maxSP },
          },
        ])
      )
      const runRoster: Record<string, DungeonRosterEntry> = Object.fromEntries(
        placedCharacters.map((character) => [
          character.id,
          {
            name: character.name,
            portraitUrl: character.portraitUrl,
            ...vitalsById.get(character.id),
          },
        ])
      )
      return (
        <DungeonRunConsole
          dungeon={dungeon}
          instance={instance}
          roster={runRoster}
          placedCharacters={placedCharacters}
          campaignShortId={campaignShortId}
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
