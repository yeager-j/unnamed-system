import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import { MemberOverview } from "@/app/campaigns/[campaignShortId]/_components/member-overview"
import { FirstRunChecklist } from "@/app/campaigns/[campaignShortId]/_components/planner/first-run-checklist"
import { RosterPanel } from "@/app/campaigns/[campaignShortId]/_components/planner/roster-panel"
import { Runner } from "@/app/campaigns/[campaignShortId]/_components/planner/runner"
import { seasonOf } from "@/domain/planner/season"
import { buildRosterView } from "@/domain/planner/view/roster"
import { auth } from "@/lib/auth"
import {
  isCampaignMember,
  loadCampaignByShortId,
  loadCampaignRoster,
} from "@/lib/db/queries/load-campaign"
import {
  loadSeasons,
  loadSlotsForDay,
} from "@/lib/db/queries/load-campaign-clock"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { getCampaignClock, getCampaignForDM } from "./planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

/** Per-request memoized campaign lookup so `generateMetadata` and the member
 *  branch share one read (the DM branch rides `getCampaignForDM`'s cache). */
const getCampaign = cache(
  async (shortId: string): Promise<CampaignRow | null> =>
    loadCampaignByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId } = await params
  const campaign = await getCampaign(campaignShortId)

  return {
    title: campaign
      ? `${campaign.name} — Showtime!`
      : "Campaign not found — Showtime!",
  }
}

/**
 * The campaign root at `/campaigns/{shortId}` — **the one viewer fork**
 * (UNN-574 D10):
 *
 * - **DM** → the Day Runner (inside the planner shell the group layout
 *   mounted): the first-run checklist until the clock starts, then the
 *   day-running surface. The old manage content relocated to `manage/`,
 *   reachable from the rail's gear.
 * - **Member** → the same read-only overview as before the restructure.
 * - **Stranger** → `notFound()`, so the URL doesn't leak that the campaign
 *   exists (the shareable surface is the `/join/{token}` link).
 */
export default async function CampaignPage({ params }: PageProps) {
  const { campaignShortId } = await params

  const dmCampaign = await getCampaignForDM(campaignShortId)
  if (dmCampaign) return <DayRunnerRoot campaign={dmCampaign} />

  const campaign = await getCampaign(campaignShortId)
  if (!campaign) notFound()

  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) notFound()

  if (await isCampaignMember(campaign.id, viewerId)) {
    return <MemberOverview campaign={campaign} viewerId={viewerId} />
  }

  notFound()
}

/**
 * The DM's Day Runner: the one planner surface with its own sidebar — the
 * placed-characters roster, an inset-variant sidebar the page builds itself
 * (the sidebar-08 pattern; the layout only provides the rail). The `top-14` /
 * `left-14` offsets seat the fixed sidebar under the global header and beside
 * the rail. Body is the first-run checklist until the clock starts, then the
 * runner.
 */
async function DayRunnerRoot({ campaign }: { campaign: CampaignRow }) {
  const [clock, roster] = await Promise.all([
    getCampaignClock(campaign.id),
    loadCampaignRoster(campaign.id),
  ])
  const [slots, seasons] = clock
    ? await Promise.all([
        loadSlotsForDay(campaign.id, clock.currentDay),
        loadSeasons(campaign.id),
      ])
    : [[], []]
  const seasonLabel = clock ? seasonOf(seasons, clock.currentDay) : null

  return (
    <SidebarProvider className="min-h-0 flex-1">
      <Sidebar
        variant="inset"
        className="top-14 h-[calc(100svh-3.5rem)] data-[side=left]:left-14"
      >
        <RosterPanel
          campaignName={campaign.name}
          dayLine={
            clock
              ? `Day ${clock.currentDay}${seasonLabel ? ` · ${seasonLabel}` : ""}`
              : null
          }
          roster={buildRosterView(roster)}
        />
      </Sidebar>
      <SidebarInset className="min-w-0">
        {clock ? (
          <Runner
            campaignId={campaign.id}
            currentDay={clock.currentDay}
            clockVersion={clock.clockVersion}
            seasonLabel={seasonLabel}
            slots={slots.map(({ id, ordinal, label }) => ({
              id,
              ordinal,
              label,
            }))}
          />
        ) : (
          <FirstRunChecklist campaignId={campaign.id} />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
