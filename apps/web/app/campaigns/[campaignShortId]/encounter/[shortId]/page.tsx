import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CombatConsole } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_components/combat-console"
import { EncounterSetup } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_components/encounter-setup"
import { EncounterEndedStub } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_components/ended-stub"
import { getEncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"

interface PageProps {
  params: Promise<{ campaignShortId: string; shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId, shortId } = await params
  const result = await getEncounterForDM(campaignShortId, shortId)

  return {
    title: result
      ? `${result.encounter.name} — Showtime!`
      : "Encounter not found — Showtime!",
  }
}

/**
 * The DM combat console at `/campaigns/{c}/encounter/{e}` (UNN-335), on engine v2
 * (UNN-535). The **status fork**: a `draft` encounter renders the setup shell,
 * a `live` one the combat console, an `ended` one the read-only stub. The
 * loader hands both client shells the same serializable {@link
 * import("@/domain/combat/load-encounter-for-dm").EncounterForDM}; the live branch additionally
 * hydrates the per-durable-participant drawer detail (party-scaled Skill
 * cards + character-row display fields). v1's initiative-stat hydration for
 * the draft branch is gone — v2's `compareInitiative` reads the resolved
 * session directly.
 */
export default async function CombatPage({ params }: PageProps) {
  const { campaignShortId, shortId } = await params
  const result = await getEncounterForDM(campaignShortId, shortId)

  if (!result) notFound()

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
      return (
        <CombatConsole
          data={result}
          combatantSheetSliceById={result.combatantSheetSliceById}
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
