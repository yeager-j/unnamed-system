import "server-only"

import { revalidatePath } from "next/cache"

import { ENCOUNTER_ROUTE } from "@/lib/paths"

/**
 * Cache invalidation for the encounter routes after a successful
 * {@link applyCombatEvent} write — the encounter-aggregate peer of
 * `revalidateCharacter` (the character one moves alongside it under
 * `lib/actions/character/` when the flat `lib/actions/` files migrate).
 *
 * Revalidates the DM combat console (`/campaigns/{c}/encounter/{e}`, UNN-335).
 * The console now nests under its campaign (UNN-608) and the write path doesn't
 * cheaply hold the campaign shortId, so this revalidates by **route template**
 * rather than by concrete address. The DM client also relies on the returned
 * version + its `useOptimistic` frame, and the signed-out player watch (UNN-322)
 * refreshes by polling, so this stays best-effort for the console's own RSC
 * (e.g. the `startCombat` status flip the client mirrors with `router.refresh()`).
 */
export function revalidateEncounter(_encounter: { shortId: string }): void {
  revalidatePath(ENCOUNTER_ROUTE, "page")
}
