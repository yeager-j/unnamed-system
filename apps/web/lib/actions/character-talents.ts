"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addGainedTalent,
  removeGainedTalent,
  type CharacterTalentPersistenceSuccess,
} from "@/lib/db/character-talents"
import { err, type Result } from "@/lib/result"

import {
  AddGainedTalentSchema,
  RemoveGainedTalentSchema,
  type AddGainedTalentInput,
  type GainedTalentActionError,
  type RemoveGainedTalentInput,
} from "./character-talents.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Adds / removes a player-picked Talent on the character's `gainedTalents`
 * array. Dedupe and known-key validation live in the persistence layer so
 * they're applied atomically with the row's identity-class bump; the
 * builder-only Background slot cap (`MAX_PLAYER_ADDED_TALENTS`) is enforced
 * client-side in `talents-picker.tsx`. This action layer just plumbs auth
 * and validation.
 */

export async function addGainedTalentAction(
  input: AddGainedTalentInput
): Promise<Result<CharacterTalentPersistenceSuccess, GainedTalentActionError>> {
  const parsed = AddGainedTalentSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await addGainedTalent(
    character.id,
    parsed.data.talentKey,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function removeGainedTalentAction(
  input: RemoveGainedTalentInput
): Promise<Result<CharacterTalentPersistenceSuccess, GainedTalentActionError>> {
  const parsed = RemoveGainedTalentSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await removeGainedTalent(
    character.id,
    parsed.data.talentKey,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
