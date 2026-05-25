"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterIdentityList,
  type CharacterIdentityListPersistenceSuccess,
} from "@/lib/db/character-identity-lists"
import { err, type Result } from "@/lib/game/result"

import {
  UpdateCharacterIdentityListSchema,
  type UpdateCharacterIdentityListError,
  type UpdateCharacterIdentityListInput,
} from "./character-identity-lists.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Persists one of the five Step-4 Identity columns (Personality Traits,
 * Hopes, Dreams, Fears, Secrets). All five are identity-class — they share
 * `identityVersion` with name/pronouns/narrative edits, so two of them in
 * flight at the same time correctly race (the loser is silently retried by
 * {@link useDebouncedAutoSave}'s pipeline).
 */
export async function updateCharacterIdentityListAction(
  input: UpdateCharacterIdentityListInput
): Promise<
  Result<
    CharacterIdentityListPersistenceSuccess,
    UpdateCharacterIdentityListError
  >
> {
  const parsed = UpdateCharacterIdentityListSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterIdentityList(
    character.id,
    parsed.data.field,
    parsed.data.text,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
