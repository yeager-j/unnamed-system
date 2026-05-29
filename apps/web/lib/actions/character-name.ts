"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterName,
  type CharacterNamePersistenceSuccess,
} from "@/lib/db/writes/name"
import { type Result } from "@/lib/result"

import {
  UpdateCharacterNameSchema,
  type UpdateCharacterNameError,
  type UpdateCharacterNameInput,
} from "./character-name.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * The canonical Server Action: typed input → Zod parse → `requireOwner` →
 * persistence call → `revalidateCharacter` → return `Result`. Every owner-mode
 * write follows the same shape (see `lib/actions/README.md`).
 */

/**
 * Updates the character's display name. The viewer must be the owner; a
 * non-owner caller never reaches the persistence layer (the gate trips
 * Next's `forbidden()`).
 */
export async function updateCharacterNameAction(
  input: UpdateCharacterNameInput
): Promise<Result<CharacterNamePersistenceSuccess, UpdateCharacterNameError>> {
  const parsed = UpdateCharacterNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterName(
    character.id,
    parsed.data.name,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
