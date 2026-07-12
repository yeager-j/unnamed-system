import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NpcList } from "@/app/campaigns/[campaignShortId]/_components/world/npc-list"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildNpcListView } from "@/domain/planner/view/world"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
} from "@/lib/db/queries/load-campaign-world"

import { getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export const metadata: Metadata = { title: "NPCs — Showtime!" }

/**
 * The NPCs list (UNN-575's thin world surface, DM-only like every nested
 * planner route): mint, see, delete. Full entity pages — trait pickers,
 * Identity/Origins, relations — are phase 6.
 */
export default async function NpcsPage({ params }: PageProps) {
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
        <h1 className="font-display text-3xl">NPCs</h1>
        <p className="text-sm text-muted-foreground">
          The people of {campaign.name} — quick-mint a name now, deepen them
          later.
        </p>
      </header>
      <NpcList
        campaignId={campaign.id}
        rows={buildNpcListView(npcs)}
        linkerOptions={buildLinkerOptions({ npcs, articles })}
      />
    </div>
  )
}
