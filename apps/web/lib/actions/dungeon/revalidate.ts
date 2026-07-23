import "server-only"

import { revalidatePath } from "next/cache"

import { DUNGEON_ROUTE } from "@/lib/paths"

/**
 * Cache invalidation for the dungeon routes after a successful delve write — the
 * dungeon-aggregate peer of {@link import("../encounter/revalidate").revalidateEncounter}.
 *
 * Revalidates the DM run console (`/campaigns/{c}/dungeon/{d}`, UNN-462). The
 * console now nests under its campaign (UNN-608) and the write path doesn't cheaply
 * hold the campaign shortId, so this revalidates by **route template**. The
 * Headcanon predicted root owns local prediction and receipts; this hook only
 * expires the route cache. Axis invalidation and the public observe root's
 * polling fallback keep the watch current.
 */
export function revalidateDungeon(_dungeon: { shortId: string }): void {
  revalidatePath(DUNGEON_ROUTE, "page")
}
