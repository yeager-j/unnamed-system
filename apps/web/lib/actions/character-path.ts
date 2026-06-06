"use server"

import { err, type Result } from "@workspace/game/foundation/result"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterPath,
  type CharacterPathPersistenceSuccess,
} from "@/lib/db/writes/path"

import {
  UpdateCharacterPathSchema,
  type UpdateCharacterPathError,
  type UpdateCharacterPathInput,
} from "./character-path.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Updates the character's HP/SP path choice. The viewer must be the owner;
 * a non-owner caller never reaches the persistence layer (the gate trips
 * Next's `forbidden()`). See `lib/actions/README.md` for the canonical
 * pattern this follows.
 */
export async function updateCharacterPathAction(
  input: UpdateCharacterPathInput
): Promise<Result<CharacterPathPersistenceSuccess, UpdateCharacterPathError>> {
  const parsed = UpdateCharacterPathSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterPath(
    character.id,
    parsed.data.pathChoice,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
