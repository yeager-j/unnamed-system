import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CombatConsole } from "@/components/encounter/combat-console"
import { EncounterSetup } from "@/components/encounter/encounter-setup"
import { EncounterEndedStub } from "@/components/encounter/ended-stub"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCombatConsoleDataV2 } from "@/lib/db/queries/load-combat-console-data-v2"

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
      ? `${result.encounter.name} — Showtime!`
      : "Encounter not found — Showtime!",
  }
}

/**
 * The DM combat console at `/combat/{shortId}` (UNN-335), on engine v2
 * (UNN-535). The **status fork**: a `draft` encounter renders the setup shell,
 * a `live` one the combat console, an `ended` one the read-only stub. The
 * loader hands both client shells the same serializable {@link
 * import("./encounter-access").EncounterForDM}; the live branch additionally
 * hydrates the per-durable-participant drawer detail (party-scaled Skill
 * cards + character-row display fields). v1's initiative-stat hydration for
 * the draft branch is gone — v2's `compareInitiative` reads the resolved
 * session directly.
 */
export default async function CombatPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getEncounterForDM(shortId)

  if (!result) notFound()

  // getEncounterForDM already authorized the viewer against this campaign, so the
  // row exists; resolve its public shortId for the "← Campaign" back link.
  const campaign = await loadCampaignRowById(result.encounter.campaignId)
  const campaignShortId = campaign?.shortId ?? ""

  switch (result.encounter.status) {
    case "draft": {
      const placedCharacters = await loadPlacedCharactersForCampaign(
        result.encounter.campaignId
      )
      return (
        <EncounterSetup
          data={result}
          campaignShortId={campaignShortId}
          placedCharacters={placedCharacters}
        />
      )
    }
    case "live": {
      const durableHydrationById = await loadCombatConsoleDataV2(
        result.session,
        result.instance.state,
        result.participantMeta
      )
      return (
        <CombatConsole
          data={result}
          durableHydrationById={durableHydrationById}
          campaignShortId={campaignShortId}
        />
      )
    }
    case "ended":
      return (
        <EncounterEndedStub
          encounter={result.encounter}
          campaignShortId={campaignShortId}
        />
      )
  }
}
