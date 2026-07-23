import "server-only"

import { revalidatePath } from "next/cache"

import { ENCOUNTER_ROUTE } from "@/lib/paths"

/**
 * Cache invalidation for encounter routes after a Headcanon combat command is
 * accepted. The registered `combat.event`, `combat.write`, and `combat.end`
 * commands call this finalization hook.
 *
 * Revalidates the DM combat console (`/campaigns/{c}/encounter/{e}`, UNN-335).
 * The console now nests under its campaign (UNN-608) and the write path doesn't
 * cheaply hold the campaign shortId, so this revalidates by **route template**
 * rather than by concrete address. Headcanon owns prediction, receipts,
 * contention retry, accepted-stamp finalization, and axis invalidation. This
 * app hook only expires the route template cache. The DM root receives canon
 * through route refresh; the watch root uses axis invalidation and polling.
 */
export function revalidateEncounter(_encounter: { shortId: string }): void {
  revalidatePath(ENCOUNTER_ROUTE, "page")
}
