"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterIdentityTrait,
  type CharacterIdentityTraitPersistenceSuccess,
} from "@/lib/db/character-identity-traits"
import { err, type Result } from "@/lib/result"

import {
  UpdateCharacterIdentityTraitSchema,
  type UpdateCharacterIdentityTraitError,
  type UpdateCharacterIdentityTraitInput,
} from "./character-identity-traits.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Persists one of the five Step-4 Identity columns (Personality Traits,
 * Hopes, Dreams, Fears, Secrets). All five are identity-class — they share
 * `identityVersion` with name/pronouns/narrative edits, so two of them in
 * flight at the same time correctly race (the loser is silently retried by
 * {@link useDebouncedAutoSave}'s pipeline).
 */
export async function updateCharacterIdentityTraitAction(
  input: UpdateCharacterIdentityTraitInput
): Promise<
  Result<
    CharacterIdentityTraitPersistenceSuccess,
    UpdateCharacterIdentityTraitError
  >
> {
  const parsed = UpdateCharacterIdentityTraitSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterIdentityTrait(
    character.id,
    parsed.data.field,
    parsed.data.text,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
