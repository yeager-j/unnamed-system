import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ArticlePage } from "@/app/campaigns/[campaignShortId]/_components/world/article-page"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildTimelineDayViews } from "@/domain/planner/view/timeline"
import {
  ARTICLE_TYPE_SUGGESTIONS,
  articleTypeOptions,
} from "@/domain/planner/view/world"
import { buildRelationListView } from "@/domain/planner/view/world-detail"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadUpdatesForParticipant } from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticle,
  loadCampaignArticles,
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
  params: Promise<{ campaignShortId: string; articleId: string }>
}

export const metadata: Metadata = { title: "Article — Showtime!" }

/**
 * The Article detail page (UNN-579): loads the document + its world-web
 * context (relations, per-entity timeline, ref counts) and resolves every
 * co-participant's current name in one campaign-scoped batch.
 */
export default async function ArticleDetailPage({ params }: PageProps) {
  const { campaignShortId, articleId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const article = await loadCampaignArticle(campaign.id, articleId)
  if (!article) notFound()

  const self = { kind: "article", id: article.id } as const
  const [
    clock,
    folders,
    npcs,
    articles,
    characters,
    relations,
    updates,
    counts,
  ] = await Promise.all([
    getCampaignClock(campaign.id),
    loadWorldFolders(campaign.id, "article"),
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
    loadPlacedCharactersForCampaign(campaign.id),
    loadRelationsFrom(campaign.id, self),
    loadUpdatesForParticipant(campaign.id, self),
    loadParticipantRefCounts(campaign.id, self),
  ])

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

  const typeOptions = [
    ...new Set([...ARTICLE_TYPE_SUGGESTIONS, ...articleTypeOptions(articles)]),
  ]

  return (
    <ArticlePage
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      article={{
        id: article.id,
        name: article.name,
        body: article.body,
        type: article.type,
        datedDay: article.datedDay,
        datedKind: article.datedKind,
        folderName:
          folders.find((folder) => folder.id === article.folderId)?.name ??
          null,
      }}
      typeOptions={typeOptions}
      linkerOptions={buildLinkerOptions({ npcs, articles, characters })}
      relations={buildRelationListView(relations, hits)}
      timeline={buildTimelineDayViews(updates, hits, { elide: self })}
      beatMentions={counts.beatMentions}
      currentDay={clock?.currentDay ?? null}
    />
  )
}
