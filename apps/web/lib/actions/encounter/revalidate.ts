import "server-only"

import { revalidatePath } from "next/cache"

/**
 * Cache invalidation for the encounter routes after a successful
 * {@link applyCombatEvent} write — the encounter-aggregate peer of
 * `revalidateCharacter` (the character one moves alongside it under
 * `lib/actions/character/` when the flat `lib/actions/` files migrate).
 *
 * Revalidates the DM combat console (`/combat/{shortId}`, UNN-335). The DM
 * client also relies on the returned version + its `useOptimistic` frame, and
 * the signed-out player view (UNN-322) refreshes by polling, so this is
 * best-effort for the console's own RSC (e.g. the `startCombat` status flip the
 * client mirrors with `router.refresh()`).
 */
export function revalidateEncounter(encounter: { shortId: string }): void {
  revalidatePath(`/combat/${encounter.shortId}`)
}
