import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ArticleList } from "@/app/campaigns/[campaignShortId]/_components/world/article-list"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildArticleListView } from "@/domain/planner/view/world"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
} from "@/lib/db/queries/load-campaign-world"

import { getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export const metadata: Metadata = { title: "Articles — Showtime!" }

/**
 * The Articles list (UNN-575's thin world surface, DM-only like every nested
 * planner route): mint, see, delete. Article pages — prose, dates,
 * relations — are later phases.
 */
export default async function ArticlesPage({ params }: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const [npcs, articles] = await Promise.all([
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <header>
        <h1 className="font-display text-3xl">Articles</h1>
        <p className="text-sm text-muted-foreground">
          The world web of {campaign.name} — places, factions, threats, lore.
        </p>
      </header>
      <ArticleList
        campaignId={campaign.id}
        rows={buildArticleListView(articles)}
        linkerOptions={buildLinkerOptions({ npcs, articles })}
      />
    </div>
  )
}
