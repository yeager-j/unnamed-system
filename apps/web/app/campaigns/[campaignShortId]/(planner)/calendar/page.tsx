import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PlannerStub } from "@/app/campaigns/[campaignShortId]/_components/planner/planner-stub"
import { loadCampaignClock } from "@/lib/db/queries/load-campaign-clock"

import { getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export const metadata: Metadata = { title: "Calendar — Showtime!" }

/**
 * The Calendar's phase-1 stub (UNN-574 D10): DM-only like every nested
 * planner route; points home to start the clock when it hasn't been, and
 * names what's coming when it has. The real agenda/ribbon surface is phase 5.
 */
export default async function CalendarPage({ params }: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const clock = await loadCampaignClock(campaign.id)

  return (
    <PlannerStub
      surface="Calendar"
      campaignShortId={campaign.shortId}
      clockStarted={clock !== null}
      comingCopy="The agenda of upcoming days — scheduled beats, deadlines counting down, seasons — arrives in a later phase."
    />
  )
}
