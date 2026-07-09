import { auth } from "./index"

/**
 * The single sanctioned way to answer "who is looking at this character
 * sheet?" — the read-side classification used to conditionally render owner
 * affordances. Downstream owner-mode features must consume this rather than
 * re-deriving the comparison. Affordance rendering is *cosmetic*; the real
 * write-side gate is the entity door's `requireEntityOwner` /
 * `requireOwnerOrCampaignDMForEntity` (`campaign-access.ts`), which a signed-in
 * non-owner with DOM tricks can never get past.
 */

/** Resolved relationship of the current session to a character sheet. */
export type ViewerRole = "owner" | "signed-in-other" | "signed-out"

/**
 * The viewer's role relative to the given character. Accepts any object that
 * exposes `ownerId` so callers can pass an `EntityRow`, a `CharacterProfile`,
 * or a thin projection. Returns `"signed-out"` for crawlers and unauthenticated
 * guests; `"signed-in-other"` when a session exists but does not belong to the
 * owner; `"owner"` when it does.
 */
export async function getViewerRole(character: {
  ownerId: string
}): Promise<ViewerRole> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) return "signed-out"
  return viewerId === character.ownerId ? "owner" : "signed-in-other"
}
