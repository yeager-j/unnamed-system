import "server-only"

import { revalidatePath } from "next/cache"

import type { EntityStatus } from "@/lib/db/schema/entity"

/**
 * Centralized cache invalidation for the character sheet route. Every
 * owner-mode write should call this on success so derived stats
 * (attributes, affinities, weapon attack roll, etc.) re-render with the
 * new state. Knowing the URL structure is now this module's job — if
 * `/c/{shortId}` ever moves (locale prefix, route restructure), the change
 * is one-touch instead of N actions.
 *
 * For drafts (UNN-204) we also revalidate the builder route subtree so
 * the wizard's server-rendered props (name, pronouns, portraitUrl,
 * builderStep) stay current — the Next button's required-field gate reads
 * from those props.
 */
export function revalidateCharacter(character: {
  shortId: string
  status: EntityStatus
}): void {
  revalidatePath(`/c/${character.shortId}`)
  if (character.status === "draft") {
    revalidatePath(`/builder/${character.shortId}`, "layout")
  }
}
