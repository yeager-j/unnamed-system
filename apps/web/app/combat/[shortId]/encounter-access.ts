import { cache } from "react"

import { auth } from "@/lib/auth"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadEncounterRowByShortId } from "@/lib/db/queries/load-encounter"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/** The DM console's spatially-complete view of an encounter: the encounter row
 *  plus the {@link MapInstanceRow} it references (zones/occupancy/engagement/
 *  enchantment — relocated off the session by UNN-459). */
export interface EncounterForDM {
  encounter: EncounterRow
  instance: MapInstanceRow
}

/**
 * Resolves the encounter **and its Map Instance** for the current viewer, or
 * `null` if it is missing or the viewer is not its campaign's DM. The DM console
 * and its sub-routes are DM-only, and we return the *same* nothing for "not
 * found" and "not your campaign" so the route 404s either way without leaking
 * that an encounter exists. The signed-out player watch view is a separate
 * `shortId` route (UNN-322).
 *
 * The Instance is loaded alongside (UNN-459) so every DM surface reads
 * position/engagement/enchantment from one place; `mapInstanceId` is non-null,
 * so a missing Instance row is a data integrity fault and collapses to the same
 * `null` (the route 404s).
 *
 * Per-request memoized (React `cache`) so a page, its `generateMetadata`, and
 * any sub-route resolve it once — shared by `/combat/[shortId]` and its
 * `enemies/` browse sub-route (UNN-346).
 */
export const getEncounterForDM = cache(
  async (shortId: string): Promise<EncounterForDM | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const encounter = await loadEncounterRowByShortId(shortId)
    if (!encounter) return null

    const campaign = await loadCampaignRowById(encounter.campaignId)
    if (!campaign || campaign.dmUserId !== viewerId) return null

    const instance = await loadMapInstanceById(encounter.mapInstanceId)
    if (!instance) return null

    return { encounter, instance }
  }
)
