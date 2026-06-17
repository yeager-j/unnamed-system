import { cache } from "react"

import { auth } from "@/lib/auth"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/** The DM console's spatially-complete view of a dungeon: the dungeon row plus
 *  the {@link MapInstanceRow} it references (the delve's geometry/occupancy/
 *  reveal-state). Mirrors `EncounterForDM`. */
export interface DungeonForDM {
  dungeon: DungeonRow
  instance: MapInstanceRow
}

/**
 * Resolves the dungeon **and its Map Instance** for the current viewer, or `null`
 * if it is missing or the viewer is not its campaign's DM — a direct parallel of
 * `getEncounterForDM` (`encounter-access.ts`). The DM console (`/dungeon/{shortId}`)
 * is DM-only, and we return the *same* nothing for "not found" and "not your
 * campaign" so the route 404s either way without leaking that a dungeon exists. A
 * non-member is, by definition, not the DM, so they 404 too. The signed-out player
 * fog view is a separate `shortId` route (`/c/dungeon/{shortId}`, M3).
 *
 * The Instance is loaded alongside so every DM surface reads position/reveal-state
 * from one place; `mapInstanceId` is non-null, so a missing Instance row is a data
 * integrity fault and collapses to the same `null` (the route 404s).
 *
 * Per-request memoized (React `cache`) so a page, its `generateMetadata`, and any
 * sub-route resolve it once.
 */
export const getDungeonForDM = cache(
  async (shortId: string): Promise<DungeonForDM | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const dungeon = await loadDungeonRowByShortId(shortId)
    if (!dungeon) return null

    const campaign = await loadCampaignRowById(dungeon.campaignId)
    if (!campaign || campaign.dmUserId !== viewerId) return null

    const instance = await loadMapInstanceById(dungeon.mapInstanceId)
    if (!instance) return null

    return { dungeon, instance }
  }
)
