import "server-only"

import { revalidatePath } from "next/cache"

import { campaignPath } from "@/lib/paths"

/**
 * Cache invalidation after a **structural** notes write (session CRUD, beat
 * create/move/delete, schedule flips). Beats feed the Notes tree, the Day
 * Runner's slot kinds, and the Calendar as phases land, so this revalidates
 * the campaign **layout** — the same whole-subtree choice as the sibling
 * aggregates. The **prose autosave deliberately never calls this** (D10):
 * the editor is client-owned while mounted, and a revalidation storm per
 * debounce tick would re-render the route under the typist.
 */
export function revalidateCampaignNotes(campaign: { shortId: string }): void {
  revalidatePath(campaignPath(campaign.shortId), "layout")
}
