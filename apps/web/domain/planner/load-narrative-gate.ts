import "server-only"

import type { Lineage } from "@workspace/game-v2/kernel/vocab"

import { getArchetype } from "@/domain/game-engine-v2"
import { availabilityFold } from "@/domain/planner/availability"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadCampaignClock } from "@/lib/db/queries/load-campaign-clock"
import { loadCampaignNpcs } from "@/lib/db/queries/load-campaign-world"

/**
 * Resolves a character's narrative gate (UNN-581, D8): `undefined` when the
 * character isn't placed in a campaign or the campaign hasn't opted into
 * Lineage gating — the all-open, byte-identical-to-today path — otherwise the
 * {@link availabilityFold} union of the story-tier origin lane and the live
 * NPCs' bond lanes. Both gate consumers resolve through here — the Atlas page
 * (display) and the entity write door (refusing a tampered
 * `spendArchetypeRank`) — so what renders locked and what refuses to unlock
 * can't drift.
 */
export async function loadNarrativeGate(input: {
  campaignId: string | null
  originArchetypeKey: string | null
}): Promise<ReadonlyMap<Lineage, number> | undefined> {
  if (input.campaignId === null) return undefined
  const campaign = await loadCampaignRowById(input.campaignId)
  if (!campaign?.lineageGating) return undefined

  const [clock, npcs] = await Promise.all([
    loadCampaignClock(campaign.id),
    loadCampaignNpcs(campaign.id),
  ])
  const originLineage = input.originArchetypeKey
    ? (getArchetype(input.originArchetypeKey)?.lineage ?? null)
    : null

  return availabilityFold({
    originLineage,
    storyTier: clock?.storyTier ?? 1,
    npcs: npcs.flatMap((npc) =>
      npc.lineageKey === null
        ? []
        : [{ lineageKey: npc.lineageKey, bondTier: npc.bondTier }]
    ),
  })
}
