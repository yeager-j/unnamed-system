import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { loadCampaignByShortId } from "@/lib/db/queries/load-campaign"
import {
  loadActiveExpeditionForRegion,
  loadRegionByShortId,
} from "@/lib/db/queries/load-region"
import type { RegionRow } from "@/lib/db/schema/region"
import { dungeonWatchPath } from "@/lib/paths"

interface PageProps {
  params: Promise<{ campaignShortId: string; regionShortId: string }>
}

/**
 * Per-request memoized Region lookup shared by `generateMetadata` and the page,
 * paired against `campaignShortId` exactly like the dungeon watch page's snapshot
 * pairing: a Region shortId probed under the wrong campaign resolves to `null` (→
 * `notFound()`), so a watch URL can't confirm a Region exists in another campaign.
 */
const getRegion = cache(
  async (
    campaignShortId: string,
    regionShortId: string
  ): Promise<RegionRow | null> => {
    const [campaign, region] = await Promise.all([
      loadCampaignByShortId(campaignShortId),
      loadRegionByShortId(regionShortId),
    ])
    if (!campaign || !region || region.campaignId !== campaign.id) return null
    return region
  }
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId, regionShortId } = await params
  const region = await getRegion(campaignShortId, regionShortId)

  return {
    title: region
      ? `${region.name} — Watch — Showtime!`
      : "Region not found — Showtime!",
  }
}

/**
 * The Region-stable **player watch** at `/campaigns/{c}/region/{r}/watch` (UNN-589)
 * — the one URL players keep across a Region's expeditions. Public and paired to the
 * campaign like the dungeon watch page ({@link dungeonWatchPath} is itself public),
 * so a signed-out spectator reaches it; a missing/foreign Region 404s.
 *
 * When an expedition is running it forwards to that run's fogged watch
 * ({@link loadActiveExpeditionForRegion} → the current `dungeon` shortId); between
 * runs (or when the Region is archived with no live run) it holds on a small card
 * telling players the link stays valid — the redirect resolves it as soon as the DM
 * starts the next expedition.
 */
export default async function RegionWatchPage({ params }: PageProps) {
  const { campaignShortId, regionShortId } = await params
  const region = await getRegion(campaignShortId, regionShortId)
  if (!region) notFound()

  const active = await loadActiveExpeditionForRegion(region.id)
  if (active) redirect(dungeonWatchPath(campaignShortId, active.shortId))

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-1 items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{region.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No expedition is running right now — keep this link, it always
            points at the current one.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
