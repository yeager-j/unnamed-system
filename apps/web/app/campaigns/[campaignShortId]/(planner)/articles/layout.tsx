import { notFound } from "next/navigation"

import { FolderTreeShell } from "@/app/campaigns/[campaignShortId]/_components/folder-tree/folder-tree-shell"
import {
  activePeriod,
  groupPeriodsByKind,
  periodOf,
  resolveDayLabel,
} from "@/domain/planner/period"
import { buildFolderForest } from "@/domain/planner/view/folder-tree"
import {
  articleTypeOptions,
  buildArticleTreeItems,
} from "@/domain/planner/view/world"
import { loadPeriods } from "@/lib/db/queries/load-campaign-clock"
import { loadCampaignFolders } from "@/lib/db/queries/load-campaign-folders"
import { loadCampaignArticles } from "@/lib/db/queries/load-campaign-world"

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
    loadCampaignFolders(campaign.id, "article"),
    loadCampaignArticles(campaign.id),
  ])
  const periods = clock ? await loadPeriods(campaign.id) : []
  const { season: seasons, month: months } = groupPeriodsByKind(periods)
  const seasonLabel = clock ? periodOf(seasons, clock.currentDay) : null
  const dayLine = clock
    ? `${resolveDayLabel(clock.currentDay, activePeriod(months, clock.currentDay))}${seasonLabel ? ` · ${seasonLabel}` : ""}`
    : null

  return (
    <FolderTreeShell
      kind="article"
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      campaignName={campaign.name}
      dayLine={dayLine}
      forest={buildFolderForest(folders, buildArticleTreeItems(articles))}
      typeOptions={articleTypeOptions(articles)}
    >
      {children}
    </FolderTreeShell>
  )
}
