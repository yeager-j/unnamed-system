import "server-only"

import { revalidatePath } from "next/cache"

import { campaignPath } from "@/lib/paths"

/**
 * Cache invalidation after a successful world write. NPCs and Articles feed
 * the linker, the world list pages, and (as later phases land) every
 * participant-rendering surface under `/campaigns/{shortId}`, so this
 * revalidates the campaign **layout** — the same whole-subtree choice as
 * `campaign-clock/revalidate.ts`.
 */
export function revalidateCampaignWorld(campaign: { shortId: string }): void {
  revalidatePath(campaignPath(campaign.shortId), "layout")
}
