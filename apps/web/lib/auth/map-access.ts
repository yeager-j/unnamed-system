import { forbidden } from "next/navigation"

import { loadMapRowById } from "@/lib/db/queries/load-map"
import type { MapRow } from "@/lib/db/schema/map"

import { auth } from "./index"

/**
 * Authorization gate for Map-owner-only mutations — the My Maps authoring side of
 * the boundary `requireOwner` (`viewer-role.ts`) draws for character sheets. A
 * Map is **user-owned** (`map.userId`, Dungeon Map ADR, *Authorization*): editing
 * it requires being that owner. This is the exact parallel of `requireOwner`, on
 * the `map` table.
 *
 * Loads the Map by id, compares its `userId` to the current session's user id,
 * and trips `forbidden()` (HTTP 403) on any mismatch — missing session, missing
 * Map, or signed-in-but-not-the-owner. Returns the loaded row on success so
 * callers don't re-query.
 *
 * Note Map ownership and **Instance** authority are independent (ADR): editing a
 * Map Instance gates on the campaign DM (`requireCampaignDM`), never on Map
 * ownership. This gate is for the **template** only.
 */
export async function requireMapOwner(mapId: string): Promise<MapRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()

  const map = await loadMapRowById(mapId)
  if (!map || map.userId !== viewerId) forbidden()

  return map
}
