import "server-only"

import { revalidatePath } from "next/cache"

import { campaignPath } from "@/lib/paths"

/**
 * Cache invalidation after a successful folder write. The trees are rendered
 * by the Articles / NPCs / Session Notes **layouts**, and a moved item shows
 * up in every surface that lists it, so a structural folder write revalidates
 * the campaign layout — the same whole-subtree choice as the sibling
 * aggregates.
 */
export function revalidateCampaignFolders(campaign: { shortId: string }): void {
  revalidatePath(campaignPath(campaign.shortId), "layout")
}
