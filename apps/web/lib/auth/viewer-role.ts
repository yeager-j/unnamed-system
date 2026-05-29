import { forbidden } from "next/navigation"

import { loadCharacterRowById } from "@/lib/db/queries/load-character"
import type { CharacterRow } from "@/lib/db/schema/character"

import { auth } from "./index"

/**
 * The single sanctioned way to answer "who is looking at this character
 * sheet?". Downstream owner-mode features (Take damage, Heal, Use Prisma,
 * Rest, Level-up, Delete, …) must consume this module — re-deriving the
 * comparison elsewhere is a code-review block.
 *
 * Two helpers, two responsibilities:
 *
 *  - {@link getViewerRole} — read-side classification used to conditionally
 *    render owner affordances. Returns one of the three
 *    {@link ViewerRole}s.
 *  - {@link requireOwner} — write-side authorization gate for Server Actions
 *    and Route Handlers. Trips Next's `forbidden()` (HTTP 403) when the
 *    caller is not the character's owner, otherwise returns the loaded
 *    {@link CharacterRow} so the action can use it without a second query.
 *
 * Affordance rendering is *cosmetic*; the real check happens server-side. A
 * signed-in non-owner with the right DOM tricks would never get past
 * `requireOwner`, and that is the intended threat model.
 */

/** Resolved relationship of the current session to a character sheet. */
export type ViewerRole = "owner" | "signed-in-other" | "signed-out"

/**
 * The viewer's role relative to the given character. Accepts any object that
 * exposes `ownerId` so callers can pass a {@link CharacterRow}, a
 * `HydratedCharacter`, or a thin projection. Returns `"signed-out"` for
 * crawlers and unauthenticated guests; `"signed-in-other"` when a session
 * exists but does not belong to the owner; `"owner"` when it does.
 */
export async function getViewerRole(character: {
  ownerId: string
}): Promise<ViewerRole> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) return "signed-out"
  return viewerId === character.ownerId ? "owner" : "signed-in-other"
}

/**
 * Authorization gate for owner-only mutations. Loads the character row by
 * id, compares its `ownerId` to the current session's user id, and trips
 * `forbidden()` on any mismatch — including missing session, missing
 * character, and signed-in-but-wrong-user. Returns the loaded row on
 * success so callers don't have to re-query.
 *
 * Use this at the top of every Server Action that mutates character state.
 */
export async function requireOwner(characterId: string): Promise<CharacterRow> {
  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) forbidden()
  const character = await loadCharacterRowById(characterId)
  if (!character || character.ownerId !== viewerId) forbidden()
  return character
}
