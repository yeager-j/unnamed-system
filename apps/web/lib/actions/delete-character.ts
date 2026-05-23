"use server"

import { revalidatePath } from "next/cache"

import { requireOwner } from "@/lib/auth/viewer-role"
import { deleteCharacter } from "@/lib/db/delete-character"
import { err, ok, type Result } from "@/lib/game/result"

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
 * Defense-in-depth: the dialog gates the destructive button on the typed
 * name matching, but the action also re-checks `confirmationName` against
 * the loaded row. A direct call with a mismatched name returns
 * `Result.err("name-mismatch")`; the legit UI path can never trip this.
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

  if (parsed.data.confirmationName.trim() !== character.name) {
    return err("name-mismatch")
  }

  const result = await deleteCharacter(character.id)
  if (!result.ok) return result

  revalidatePath("/")
  revalidatePath(`/c/${character.shortId}`)

  return ok(undefined)
}
