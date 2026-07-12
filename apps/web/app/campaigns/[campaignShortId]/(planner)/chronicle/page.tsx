import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PlannerStub } from "@/app/campaigns/[campaignShortId]/_components/planner/planner-stub"
import { loadCampaignClock } from "@/lib/db/queries/load-campaign-clock"

import { getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export const metadata: Metadata = { title: "Chronicle — Showtime!" }

/**
 * The Chronicle's phase-1 stub (UNN-574 D10): DM-only; points home pre-clock,
 * names what's coming post-clock. The real world-timeline surface is phase 7.
 */
export default async function ChroniclePage({ params }: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const clock = await loadCampaignClock(campaign.id)

  return (
    <PlannerStub
      surface="Chronicle"
      campaignShortId={campaign.shortId}
      clockStarted={clock !== null}
      comingCopy="The world's past — every recorded day, world update, and resolved deadline — arrives in a later phase."
    />
  )
}
