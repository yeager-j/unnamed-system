import "server-only"

import { revalidatePath } from "next/cache"

import { campaignPath } from "@/lib/paths"

/**
 * Cache invalidation after a successful clock write. The clock's coordinates
 * (`currentDay`, slots, seasons) feed every surface under
 * `/campaigns/{shortId}` — the Day Runner root today, Calendar/Chronicle/
 * manage as later phases land — so this revalidates the campaign **layout**
 * (the whole nested subtree) rather than enumerating pages write-by-write.
 * `requireCampaignDM` already returns the campaign row, so the concrete
 * `shortId` is free at every call site.
 */
export function revalidateCampaignClock(campaign: { shortId: string }): void {
  revalidatePath(campaignPath(campaign.shortId), "layout")
}
