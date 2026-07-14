import type { ReactNode } from "react"

import { PlannerRail } from "@/app/campaigns/[campaignShortId]/_components/planner/planner-rail"
import { ParticipantPreviewProvider } from "@/components/shared/participant-preview"

import { getCampaignForDM } from "./planner-access"

/**
 * The planner route group's layout (UNN-574 D10): the DM shell is just the
 * icon rail — every planner surface (Day Runner root, calendar, chronicle,
 * manage) renders beside it, and each page **builds its own sidebar** when it
 * has one (the Day Runner's placed-characters roster; Session Notes' tree in
 * phase 3). For anyone else the layout renders the page bare: the root page
 * makes the member/stranger call itself (member overview vs 404), and the
 * nested pages 404 on their own `getCampaignForDM` — so the fork is decided
 * once and the rail never flashes for a non-DM.
 *
 * It is also where the campaign enters scope for chip-pill hover previews
 * (UNN-622) — inside the DM branch, matching the DM gate on the preview read.
 */
export default async function PlannerLayout({
  params,
  children,
}: {
  params: Promise<{ campaignShortId: string }>
  children: ReactNode
}) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) return children

  return (
    <ParticipantPreviewProvider
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
    >
      <div className="flex min-h-[calc(100svh-3.5rem)]">
        <PlannerRail campaignShortId={campaign.shortId} />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </ParticipantPreviewProvider>
  )
}
