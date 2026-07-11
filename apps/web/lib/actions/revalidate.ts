import "server-only"

import { revalidatePath } from "next/cache"

import { characterPath } from "@/lib/paths"

/**
 * Centralized cache invalidation for the character sheet route. Every
 * owner-mode write should call this on success so derived stats
 * (attributes, affinities, weapon attack roll, etc.) re-render with the
 * new state. Knowing the URL structure is `lib/paths`' job now, so a route
 * move is one edit there rather than N actions.
 *
 * A `"layout"` revalidation of the character subtree covers both surfaces at
 * once: the sheet itself and the nested builder wizard (UNN-608 folded the
 * builder under `/characters/{shortId}/builder`), so a draft's server-rendered
 * gate props (name, pronouns, portraitUrl, builderStep) stay current too.
 */
export function revalidateCharacter(character: { shortId: string }): void {
  revalidatePath(characterPath(character.shortId), "layout")
}
