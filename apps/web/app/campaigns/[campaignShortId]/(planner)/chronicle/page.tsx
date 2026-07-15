import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ChronicleFeed } from "@/app/campaigns/[campaignShortId]/_components/chronicle/chronicle-feed"
import { ChronicleFilters } from "@/app/campaigns/[campaignShortId]/_components/chronicle/chronicle-filters"
import { ChronicleJumpRail } from "@/app/campaigns/[campaignShortId]/_components/chronicle/chronicle-jump-rail"
import {
  ActivityComposer,
  type ComposerTarget,
} from "@/app/campaigns/[campaignShortId]/_components/composer/activity-composer"
import { PlannerStub } from "@/app/campaigns/[campaignShortId]/_components/planner/planner-stub"
import {
  foldResolvedParticipants,
  type ParticipantRef,
} from "@/domain/planner/participant"
import { groupPeriodsByKind } from "@/domain/planner/period"
import {
  buildChronicleDayViews,
  parseChronicleParams,
} from "@/domain/planner/view/chronicle"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadPeriods } from "@/lib/db/queries/load-campaign-clock"
import {
  loadChroniclePage,
  loadResolvedMarkers,
} from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
  loadDatedArticles,
} from "@/lib/db/queries/load-campaign-world"
import { loadDungeonsForCampaign } from "@/lib/db/queries/load-dungeon"
import { loadEncountersForCampaign } from "@/lib/db/queries/load-encounter"
import { loadParticipantHits } from "@/lib/db/queries/load-participants"
import { campaignChroniclePath } from "@/lib/paths"

import { getCampaignClock, getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
  searchParams: Promise<{
    about?: string | string[]
    cat?: string | string[]
    idle?: string | string[]
    day?: string | string[]
  }>
}

export const metadata: Metadata = { title: "Chronicle — Showtime!" }

/**
 * The **Chronicle** (UNN-580, PRD FR-13): the past-facing world timeline —
 * "Logged today, scaled to all history". One centered prose column over the
 * `(campaignId, day, authoredAt)` keyset cursor: the first page renders
 * here, older pages append client-side. Filters live in `searchParams`
 * (shareable, back-button-friendly); `?day=N` is the day-slice entry point
 * Day-End links into. The composer is D10's fourth mount — mid-session
 * capture, stamped on `currentDay`. DM-only; pre-clock keeps the stub.
 */
export default async function ChroniclePage({
  params,
  searchParams,
}: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const clock = await getCampaignClock(campaign.id)
  if (!clock) {
    return (
      <PlannerStub
        surface="Chronicle"
        campaignShortId={campaign.shortId}
        clockStarted={false}
        comingCopy=""
      />
    )
  }

  const chronicleParams = parseChronicleParams(await searchParams)
  const { filters, startDay } = chronicleParams

  const [
    page,
    periods,
    npcs,
    articles,
    datedArticles,
    markers,
    characters,
    encounters,
    dungeons,
  ] = await Promise.all([
    loadChroniclePage(campaign.id, { cursor: null, startDay, filters }),
    loadPeriods(campaign.id),
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
    loadDatedArticles(campaign.id),
    loadResolvedMarkers(campaign.id),
    loadPlacedCharactersForCampaign(campaign.id),
    loadEncountersForCampaign(campaign.id),
    loadDungeonsForCampaign(campaign.id),
  ])

  const refs: ParticipantRef[] = [
    ...page.updates.flatMap((update): ParticipantRef[] => [
      ...(update.primary ? [update.primary] : []),
      ...update.concerns,
      ...(update.resolvesArticleId
        ? [{ kind: "article" as const, id: update.resolvesArticleId }]
        : []),
    ]),
    ...(filters.participant ? [filters.participant] : []),
  ]
  const hits = await loadParticipantHits(campaign.id, refs)
  const { season: seasons, month: months } = groupPeriodsByKind(periods)
  const days = buildChronicleDayViews(page.updates, hits, { seasons, months })

  const participantLabel =
    filters.participant === null
      ? null
      : foldResolvedParticipants([filters.participant], hits)[0]!.label

  const resolvedArticleIds = new Set(markers.map((marker) => marker.articleId))
  const bindableDeadlines = datedArticles
    .filter(
      (article) =>
        article.datedKind === "deadline" && !resolvedArticleIds.has(article.id)
    )
    .map((article) => ({ articleId: article.id, name: article.name }))

  const linkerOptions = buildLinkerOptions({
    npcs,
    articles,
    characters,
    encounters,
    dungeons,
  })
  const composerTarget: ComposerTarget = {
    kind: "world",
    primary: null,
    primaryLabel: "The world",
    currentDay: clock.currentDay,
    primaryOptions: linkerOptions,
  }
  const feedKey = JSON.stringify(chronicleParams)

  return (
    <div className="mx-auto flex w-full max-w-[1060px] items-start justify-center gap-8 px-4 py-6 md:px-6">
      <div className="flex w-full max-w-[720px] min-w-0 flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">
              Chronicle
            </h1>
            <p className="text-sm text-muted-foreground">
              The world&apos;s past, day by day
            </p>
          </div>
          <ChronicleFilters
            campaignId={campaign.id}
            campaignShortId={campaign.shortId}
            params={chronicleParams}
            participantLabel={participantLabel}
            linkerOptions={linkerOptions}
          />
        </header>

        {startDay !== null ? (
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-sm">
            <span className="font-mono text-xs text-muted-foreground">
              Showing from Day {startDay}
            </span>
            <Link
              href={campaignChroniclePath(campaign.shortId)}
              className="text-xs font-medium text-primary-text hover:underline"
            >
              Back to latest →
            </Link>
          </div>
        ) : (
          <ActivityComposer
            campaignId={campaign.id}
            target={composerTarget}
            linkerOptions={linkerOptions}
          />
        )}

        <ChronicleFeed
          key={feedKey}
          campaignId={campaign.id}
          campaignShortId={campaign.shortId}
          currentDay={clock.currentDay}
          filters={filters}
          initialDays={days}
          initialCursor={page.nextCursor}
          linkerOptions={linkerOptions}
          bindableDeadlines={bindableDeadlines}
        />
      </div>
      <ChronicleJumpRail
        campaignShortId={campaign.shortId}
        currentDay={clock.currentDay}
        params={chronicleParams}
      />
    </div>
  )
}
