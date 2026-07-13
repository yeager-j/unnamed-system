import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NpcPage } from "@/app/campaigns/[campaignShortId]/_components/world/npc-page"
import { bondEligibility } from "@/domain/planner/bond"
import { isStubNpc } from "@/domain/planner/npc"
import { npcNarrativeTexts } from "@/domain/planner/npc-documents"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildTimelineDayViews } from "@/domain/planner/view/timeline"
import { arcanaHolders, lineageHolders } from "@/domain/planner/view/world"
import { buildRelationListView } from "@/domain/planner/view/world-detail"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import {
  loadBondActivityTuples,
  loadUpdatesForParticipant,
} from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticles,
  loadCampaignNpc,
  loadCampaignNpcs,
  loadWorldFolders,
} from "@/lib/db/queries/load-campaign-world"
import { loadParticipantHits } from "@/lib/db/queries/load-participants"
import {
  loadParticipantRefCounts,
  loadRelationsFrom,
} from "@/lib/db/queries/load-world-web"

import { getCampaignClock, getCampaignForDM } from "../../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string; entityId: string }>
}

export const metadata: Metadata = { title: "NPC — Showtime!" }

/**
 * The NPC detail page (UNN-579): loads the subtype + substrate, shapes the
 * trait holders for the pickers (this NPC excluded — its own trait is never
 * "taken" from itself), and gathers the world-web context.
 */
export default async function NpcDetailPage({ params }: PageProps) {
  const { campaignShortId, entityId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const npc = await loadCampaignNpc(campaign.id, entityId)
  if (!npc) notFound()

  const self = { kind: "npc", id: npc.entityId } as const
  const [
    clock,
    folders,
    npcs,
    articles,
    characters,
    relations,
    updates,
    counts,
    bondTuples,
  ] = await Promise.all([
    getCampaignClock(campaign.id),
    loadWorldFolders(campaign.id, "npc"),
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
    loadPlacedCharactersForCampaign(campaign.id),
    loadRelationsFrom(campaign.id, self),
    loadUpdatesForParticipant(campaign.id, self),
    loadParticipantRefCounts(campaign.id, self),
    npc.lineageKey === null
      ? Promise.resolve([])
      : loadBondActivityTuples(campaign.id, [npc.entityId]),
  ])
  const [bond] = bondEligibility([npc], bondTuples)

  const refs = [
    ...relations.map((r) => ({ kind: r.targetKind, id: r.targetId })),
    ...updates.flatMap((u) => [
      ...(u.primary ? [u.primary] : []),
      ...u.concerns,
      ...(u.resolvesArticleId
        ? [{ kind: "article" as const, id: u.resolvesArticleId }]
        : []),
    ]),
  ]
  const hits = await loadParticipantHits(campaign.id, refs)

  const others = npcs.filter((row) => row.entityId !== npc.entityId)
  const narrative = npcNarrativeTexts(npc.entity.narrative ?? null)

  return (
    <NpcPage
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      npc={{
        entityId: npc.entityId,
        name: npc.entity.name,
        arcana: npc.arcana,
        lineageKey: npc.lineageKey,
        bondTier: npc.bondTier,
        bondProgress: bond?.progress ?? null,
        narrative,
        folderName:
          folders.find((folder) => folder.id === npc.folderId)?.name ?? null,
        isStub: isStubNpc({
          arcana: npc.arcana,
          lineageKey: npc.lineageKey,
          entity: { narrative: npc.entity.narrative },
        }),
      }}
      lineageHolders={Object.fromEntries(lineageHolders(others))}
      arcanaHolders={Object.fromEntries(arcanaHolders(others))}
      linkerOptions={buildLinkerOptions({ npcs, articles, characters })}
      web={{
        relations: buildRelationListView(relations, hits),
        timeline: buildTimelineDayViews(updates, hits, { elide: self }),
        beatMentions: counts.beatMentions,
        currentDay: clock?.currentDay ?? null,
      }}
    />
  )
}
