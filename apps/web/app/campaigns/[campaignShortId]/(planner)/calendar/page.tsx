import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Calendar } from "@/app/campaigns/[campaignShortId]/_components/calendar/calendar"
import { PlannerStub } from "@/app/campaigns/[campaignShortId]/_components/planner/planner-stub"
import { groupPeriodsByKind } from "@/domain/planner/period"
import { buildCalendarView } from "@/domain/planner/view/calendar"
import { loadPeriods } from "@/lib/db/queries/load-campaign-clock"
import {
  loadSchedulableBeats,
  loadUpcomingSlots,
} from "@/lib/db/queries/load-campaign-notes"
import { loadResolvedMarkers } from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticles,
  loadDeadlineArticles,
  loadEventPlacements,
} from "@/lib/db/queries/load-campaign-world"
import { loadDungeonsForCampaign } from "@/lib/db/queries/load-dungeon"

import { getCampaignClock, getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export const metadata: Metadata = { title: "Calendar — Showtime!" }

/**
 * The Calendar (UNN-578, PRD FR-8): the DM's upcoming-only agenda — the
 * deadline ribbon, one day card per materialized day from today to the
 * horizon, add-days. DM-only like every nested planner route; pre-clock it
 * keeps the phase-1 stub pointing home to start the clock.
 */
export default async function CalendarPage({ params }: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const clock = await getCampaignClock(campaign.id)
  if (!clock) {
    return (
      <PlannerStub
        surface="Calendar"
        campaignShortId={campaign.shortId}
        clockStarted={false}
        comingCopy=""
      />
    )
  }

  const [
    slots,
    periods,
    deadlineArticles,
    events,
    markers,
    articles,
    beats,
    dungeons,
  ] = await Promise.all([
    loadUpcomingSlots(campaign.id, clock.currentDay),
    loadPeriods(campaign.id),
    loadDeadlineArticles(campaign.id),
    loadEventPlacements(campaign.id),
    loadResolvedMarkers(campaign.id),
    loadCampaignArticles(campaign.id),
    loadSchedulableBeats(campaign.id),
    loadDungeonsForCampaign(campaign.id),
  ])

  const { season: seasons, month: months } = groupPeriodsByKind(periods)
  const view = buildCalendarView({
    currentDay: clock.currentDay,
    slots,
    seasons,
    months,
    deadlines: deadlineArticles.map((article) => ({
      id: article.id,
      name: article.name,
      datedDay: article.datedDay!,
    })),
    events,
    resolvedArticleIds: new Set(markers.map((marker) => marker.articleId)),
  })

  return (
    <Calendar
      campaignId={campaign.id}
      clockVersion={clock.clockVersion}
      view={view}
      articles={articles
        .filter((article) => article.datedDay === null)
        .map((article) => ({
          id: article.id,
          name: article.name,
          type: article.type,
        }))}
      beats={beats}
      dungeons={dungeons.map((dungeon) => ({
        id: dungeon.id,
        name: dungeon.name,
      }))}
    />
  )
}
