import "server-only"

import { revalidatePath } from "next/cache"

/**
 * Centralized cache invalidation for the character sheet route. Every
 * owner-mode write should call this on success so derived stats
 * (attributes, affinities, weapon attack roll, etc.) re-render with the
 * new state. Knowing the URL structure is now this module's job — if
 * `/c/{shortId}` ever moves (locale prefix, route restructure), the change
 * is one-touch instead of N actions.
 */
export function revalidateCharacter(character: { shortId: string }): void {
  revalidatePath(`/c/${character.shortId}`)
}
