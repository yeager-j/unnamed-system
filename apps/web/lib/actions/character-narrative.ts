"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterNarrative,
  type CharacterNarrativePersistenceSuccess,
} from "@/lib/db/character-narrative"
import { err, type Result } from "@/lib/result"

import {
  UpdateCharacterNarrativeSchema,
  type UpdateCharacterNarrativeError,
  type UpdateCharacterNarrativeInput,
} from "./character-narrative.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Persists one of the three Step-3 narrative free-text columns (Ancestry,
 * Background, Backstory). All three are identity-class — they share
 * `identityVersion` with name/pronouns/identity-list edits, so two of them
 * in flight at the same time correctly race (the loser is silently retried
 * by {@link useDebouncedAutoSave}'s UNN-203 pipeline).
 */
export async function updateCharacterNarrativeAction(
  input: UpdateCharacterNarrativeInput
): Promise<
  Result<CharacterNarrativePersistenceSuccess, UpdateCharacterNarrativeError>
> {
  const parsed = UpdateCharacterNarrativeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterNarrative(
    character.id,
    parsed.data.field,
    parsed.data.text,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
