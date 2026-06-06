"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import { deleteCharacter } from "@/lib/db/writes/delete-character"

import {
  DeleteCharacterSchema,
  type DeleteCharacterError,
  type DeleteCharacterInput,
} from "./delete-character.schema"

/**
 * Permanently deletes a character and every dependent row. The viewer must
 * be the owner; a non-owner caller never reaches the persistence layer (the
 * gate trips Next's `forbidden()`).
 *
 * Two confirmation flows depending on the loaded row (UNN-219, ADR-002 §5.5):
 *
 * - **Named row** (finalized characters, named drafts): the dialog gates the
 *   destructive button on the typed name matching, and this action also
 *   re-checks `confirmationName` against the loaded row as defense-in-depth.
 * - **Unnamed row** (drafts where `name` is empty): the dialog shows a plain
 *   "Discard this draft?" confirm with no typed-name input, and this action
 *   accepts a missing/empty `confirmationName`. Typing a non-empty
 *   `confirmationName` against an unnamed row is treated as a malformed
 *   call.
 *
 * Revalidates both `/` (so My Characters re-renders without the deleted
 * row) and `/c/{shortId}` (so the public URL immediately returns 404 from
 * the page route's `notFound()` branch). Inlined here rather than going
 * through `revalidateCharacter` because `/` revalidation is unique to
 * deletion.
 */
export async function deleteCharacterAction(
  input: DeleteCharacterInput
): Promise<Result<void, DeleteCharacterError>> {
  const parsed = DeleteCharacterSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const typed = parsed.data.confirmationName?.trim() ?? ""
  const rowName = character.name.trim()

  if (rowName.length === 0) {
    if (typed.length !== 0) return err("name-mismatch")
  } else {
    if (typed !== rowName) return err("name-mismatch")
  }

  const result = await deleteCharacter(character.id)
  if (!result.ok) return result

  revalidatePath("/")
  revalidatePath(`/c/${character.shortId}`)

  return ok(undefined)
}
