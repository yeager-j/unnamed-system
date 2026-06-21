import "server-only"

import { revalidatePath } from "next/cache"

/**
 * Cache invalidation for the dungeon routes after a successful delve write — the
 * dungeon-aggregate peer of {@link import("../encounter/revalidate").revalidateEncounter}.
 *
 * Revalidates the DM run console (`/dungeon/{shortId}`, UNN-462). The DM client
 * mirrors each event optimistically and relies on the returned version, so this is
 * best-effort for the console's own RSC (e.g. the `draft → active` status flip the
 * client follows with `router.refresh()`). The signed-out player view
 * (`/c/dungeon/{shortId}`) is M3 and refreshes by polling, so it takes no
 * revalidation here.
 */
export function revalidateDungeon(dungeon: { shortId: string }): void {
  revalidatePath(`/dungeon/${dungeon.shortId}`)
}
