import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { type InitiativeStats } from "@workspace/game/engine"

import { CombatConsole } from "@/components/combat/combat-console"
import { EncounterSetup } from "@/components/combat/encounter-setup"
import { EncounterEndedStub } from "@/components/combat/ended-stub"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { loadCombatConsoleData } from "@/lib/db/queries/load-combat-console-data"

import { getEncounterForDM } from "./encounter-access"

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
      ? `${result.encounter.name} — Unnamed System`
      : "Encounter not found — Unnamed System",
  }
}

/**
 * The DM combat console at `/combat/{shortId}` (UNN-335). The **status fork** is
 * this ticket's deliverable: a `draft` encounter renders the setup shell, a
 * `live` one the combat console, and an `ended` one a read-only terminal view.
 * Only the setup shell's frame is load-bearing here; the three branch bodies are
 * stubbed by their own downstream tickets.
 */
export default async function CombatPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getEncounterForDM(shortId)

  if (!result) notFound()
  const { encounter, instance } = result

  // getEncounterForDM already authorized the viewer against this campaign, so the
  // row exists; resolve its public shortId for the "← Campaign" back link.
  const campaign = await loadCampaignRowById(encounter.campaignId)
  const campaignShortId = campaign?.shortId ?? ""

  switch (encounter.status) {
    case "draft": {
      const placedCharacters = await loadPlacedCharactersForCampaign(
        encounter.campaignId
      )
      // The start-combat dialog suggests the higher-Agility first side (UNN-303 /
      // rulebook 3.2), so it needs each placeable PC's derived Agility/Luck —
      // hydrate them (as the `live` branch does for combatants) into a lean map.
      const hydrated = await Promise.all(
        placedCharacters.map((character) =>
          loadHydratedCharacterById(character.id)
        )
      )
      const pcStatsById: Record<string, InitiativeStats> = Object.fromEntries(
        hydrated
          .filter((character) => character !== null)
          .map((character) => [
            character.id,
            {
              agility: character.attributes.agility,
              luck: character.attributes.luck,
            },
          ])
      )
      return (
        <EncounterSetup
          encounter={encounter}
          instance={instance}
          campaignShortId={campaignShortId}
          placedCharacters={placedCharacters}
          pcStatsById={pcStatsById}
        />
      )
    }
    case "live": {
      const { pcDetailById, pcShortIdById } = await loadCombatConsoleData(
        encounter,
        instance
      )
      return (
        <CombatConsole
          encounter={encounter}
          instance={instance}
          campaignShortId={campaignShortId}
          pcDetailById={pcDetailById}
          pcShortIdById={pcShortIdById}
        />
      )
    }
    case "ended":
      return (
        <EncounterEndedStub
          encounter={encounter}
          campaignShortId={campaignShortId}
        />
      )
  }
}
