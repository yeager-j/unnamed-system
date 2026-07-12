import { cache } from "react"

import { auth } from "@/lib/auth"
import { loadCampaignByShortId } from "@/lib/db/queries/load-campaign"
import { loadCampaignClock } from "@/lib/db/queries/load-campaign-clock"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { CampaignClockRow } from "@/lib/db/schema/campaign-clock"

/**
 * Resolves the campaign for the current viewer **as its DM**, or `null` when
 * it is missing or the viewer is anyone else — the planner's co-located route
 * loader, a direct parallel of `getDungeonForDM` (`dungeon-access.ts`). Every
 * nested planner surface (manage, calendar, chronicle, …) is DM-only and
 * `notFound()`s on `null`, returning the *same* nothing for "no such
 * campaign" and "not your campaign" so a stranger's probe can't tell them
 * apart (D10's 404-collapse). The root page is the one viewer fork: it
 * renders the member overview for members instead of 404ing.
 *
 * Per-request memoized (React `cache`) so the group layout, a page, and its
 * `generateMetadata` resolve it once.
 */
export const getCampaignForDM = cache(
  async (campaignShortId: string): Promise<CampaignRow | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const campaign = await loadCampaignByShortId(campaignShortId)
    if (!campaign || campaign.dmUserId !== viewerId) return null

    return campaign
  }
)

/**
 * Per-request memoized clock read — the shell layout (day pill) and the Day
 * Runner page both need it, so the group resolves it once.
 */
export const getCampaignClock = cache(
  async (campaignId: string): Promise<CampaignClockRow | null> =>
    loadCampaignClock(campaignId)
)
