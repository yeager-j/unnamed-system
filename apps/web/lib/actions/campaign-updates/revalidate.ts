import "server-only"

import { revalidatePath } from "next/cache"

import { campaignPath } from "@/lib/paths"

/**
 * Cache invalidation after an update-stream write. Activities feed the Day
 * Runner's workspace/pips today and the Chronicle + entity timelines as
 * later phases land, so this revalidates the campaign **layout** — the same
 * whole-subtree choice as the sibling aggregates.
 */
export function revalidateCampaignUpdates(campaign: { shortId: string }): void {
  revalidatePath(campaignPath(campaign.shortId), "layout")
}
