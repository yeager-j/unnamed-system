import "server-only"

import { revalidatePath } from "next/cache"

/**
 * Cache invalidation for the encounter routes after a successful
 * {@link applyCombatEvent} write — the encounter-aggregate peer of
 * `revalidateCharacter` (the character one moves alongside it under
 * `lib/actions/character/` when the flat `lib/actions/` files migrate).
 *
 * PROVISIONAL: no encounter route exists yet — the DM console (UNN-335) and the
 * signed-out player view (UNN-322) land later. The DM client relies on the
 * returned version + its `useOptimistic` frame, and the player view refreshes by
 * polling (UNN-322), so this is thin best-effort today. The `shortId` path is a
 * placeholder to be confirmed when those routes are defined.
 */
export function revalidateEncounter(encounter: { shortId: string }): void {
  revalidatePath(`/e/${encounter.shortId}`)
}
