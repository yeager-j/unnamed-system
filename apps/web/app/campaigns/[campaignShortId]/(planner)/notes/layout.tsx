import { notFound } from "next/navigation"

import { FolderTreeShell } from "@/app/campaigns/[campaignShortId]/_components/folder-tree/folder-tree-shell"
import { seasonOf } from "@/domain/planner/season"
import { buildFolderForest } from "@/domain/planner/view/folder-tree"
import { buildBeatTreeItems } from "@/domain/planner/view/notes"
import { loadSeasons } from "@/lib/db/queries/load-campaign-clock"
import { loadCampaignFolders } from "@/lib/db/queries/load-campaign-folders"
import { loadBeatsForTree } from "@/lib/db/queries/load-campaign-notes"

import { getCampaignClock, getCampaignForDM } from "../planner-access"

interface LayoutProps {
  params: Promise<{ campaignShortId: string }>
  children: React.ReactNode
}

/**
 * The Session Notes rail (UNN-617): the same layout-owned folder tree the
 * Articles and NPCs rails render — sessions are `kind = 'session'` folders,
 * beats are its items — so the tree survives navigation between the index and
 * a beat with its expand state intact; the routed page renders in the inset.
 */
export default async function NotesLayout({ params, children }: LayoutProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const [clock, folders, beats] = await Promise.all([
    getCampaignClock(campaign.id),
    loadCampaignFolders(campaign.id, "session"),
    loadBeatsForTree(campaign.id),
  ])
  const seasons = clock ? await loadSeasons(campaign.id) : []
  const seasonLabel = clock ? seasonOf(seasons, clock.currentDay) : null

  return (
    <FolderTreeShell
      kind="session"
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      campaignName={campaign.name}
      dayLine={
        clock
          ? `Day ${clock.currentDay}${seasonLabel ? ` · ${seasonLabel}` : ""}`
          : null
      }
      forest={buildFolderForest(folders, buildBeatTreeItems(beats))}
      typeOptions={[]}
    >
      {children}
    </FolderTreeShell>
  )
}
