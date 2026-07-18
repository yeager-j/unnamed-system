import "server-only"

import { revalidatePath } from "next/cache"

import { campaignManagePath, campaignRegionPath } from "@/lib/paths"

/**
 * Cache invalidation for the Region surfaces after a successful write (UNN-589) —
 * the Region-aggregate peer of {@link import("../dungeon/revalidate").revalidateDungeon}.
 *
 * Two dependents move together on any create/settings/archive/delete: the campaign
 * **Manage** page (its Regions list) and the Region **detail** page (its header +
 * settings). Both concrete addresses are cheaply held — every Region action already
 * loads the campaign row (via `requireCampaignDM`, for `shortId`) and the Region's
 * own `shortId` — so this revalidates by concrete path rather than by route
 * template (the dungeon console's constraint doesn't apply here). Revalidating a
 * just-deleted Region's detail path is intentional, not wasteful: a DM with that
 * page open should see it fall to a 404.
 */
export function revalidateRegion(region: {
  campaignShortId: string
  regionShortId: string
}): void {
  revalidatePath(campaignManagePath(region.campaignShortId))
  revalidatePath(
    campaignRegionPath(region.campaignShortId, region.regionShortId)
  )
}
