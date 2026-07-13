import { notFound } from "next/navigation"

import { WorldShell } from "@/app/campaigns/[campaignShortId]/_components/world/world-shell"
import { seasonOf } from "@/domain/planner/season"
import {
  articleTypeOptions,
  buildArticleTreeItems,
} from "@/domain/planner/view/world"
import { buildWorldForest } from "@/domain/planner/view/world-tree"
import { loadSeasons } from "@/lib/db/queries/load-campaign-clock"
import {
  loadCampaignArticles,
  loadWorldFolders,
} from "@/lib/db/queries/load-campaign-world"

import { getCampaignClock, getCampaignForDM } from "../planner-access"

interface LayoutProps {
  params: Promise<{ campaignShortId: string }>
  children: React.ReactNode
}

/**
 * The Articles rail (UNN-579, D11): the layout owns the folder-tree sidebar
 * so it survives navigation between the index and detail pages with its
 * expand state intact; the routed page renders in the inset.
 */
export default async function ArticlesLayout({
  params,
  children,
}: LayoutProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const [clock, folders, articles] = await Promise.all([
    getCampaignClock(campaign.id),
    loadWorldFolders(campaign.id, "article"),
    loadCampaignArticles(campaign.id),
  ])
  const seasons = clock ? await loadSeasons(campaign.id) : []
  const seasonLabel = clock ? seasonOf(seasons, clock.currentDay) : null

  return (
    <WorldShell
      kind="article"
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      campaignName={campaign.name}
      dayLine={
        clock
          ? `Day ${clock.currentDay}${seasonLabel ? ` · ${seasonLabel}` : ""}`
          : null
      }
      forest={buildWorldForest(folders, buildArticleTreeItems(articles))}
      typeOptions={articleTypeOptions(articles)}
    >
      {children}
    </WorldShell>
  )
}
