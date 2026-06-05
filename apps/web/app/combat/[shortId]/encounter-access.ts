import { cache } from "react"

import { auth } from "@/lib/auth"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadEncounterRowByShortId } from "@/lib/db/queries/load-encounter"
import type { EncounterRow } from "@/lib/db/schema/encounter"

/**
 * Resolves the encounter for the current viewer, or `null` if it is missing or
 * the viewer is not its campaign's DM. The DM console and its sub-routes are
 * DM-only, and we return the *same* nothing for "not found" and "not your
 * campaign" so the route 404s either way without leaking that an encounter
 * exists. The signed-out player watch view is a separate `shortId` route
 * (UNN-322).
 *
 * Per-request memoized (React `cache`) so a page, its `generateMetadata`, and
 * any sub-route resolve it once — shared by `/combat/[shortId]` and its
 * `enemies/` browse sub-route (UNN-346).
 */
export const getEncounterForDM = cache(
  async (shortId: string): Promise<EncounterRow | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const encounter = await loadEncounterRowByShortId(shortId)
    if (!encounter) return null

    const campaign = await loadCampaignRowById(encounter.campaignId)
    if (!campaign || campaign.dmUserId !== viewerId) return null

    return encounter
  }
)
