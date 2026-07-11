import "server-only"

import { revalidatePath } from "next/cache"

import { DUNGEON_ROUTE } from "@/lib/paths"

/**
 * Cache invalidation for the dungeon routes after a successful delve write — the
 * dungeon-aggregate peer of {@link import("../encounter/revalidate").revalidateEncounter}.
 *
 * Revalidates the DM run console (`/campaigns/{c}/dungeon/{d}`, UNN-462). The
 * console now nests under its campaign (UNN-608) and the write path doesn't cheaply
 * hold the campaign shortId, so this revalidates by **route template**. The DM
 * client mirrors each event optimistically and relies on the returned version, so
 * this stays best-effort for the console's own RSC (e.g. the `draft → active` flip
 * the client follows with `router.refresh()`). The signed-out player watch
 * (`/campaigns/{c}/dungeon/{d}/watch`) refreshes by polling, so it takes no
 * revalidation here.
 */
export function revalidateDungeon(_dungeon: { shortId: string }): void {
  revalidatePath(DUNGEON_ROUTE, "page")
}
