"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addCharacterChain,
  removeCharacterChain,
  updateCharacterChainDescription,
  updateCharacterChainTitle,
  type AddChainSuccess,
  type CharacterChainPersistenceSuccess,
} from "@/lib/db/character-chains"
import { err, type Result } from "@/lib/game/result"

import {
  AddChainSchema,
  RemoveChainSchema,
  UpdateChainDescriptionSchema,
  UpdateChainTitleSchema,
  type AddChainInput,
  type ChainActionError,
  type RemoveChainInput,
  type UpdateChainDescriptionInput,
  type UpdateChainTitleInput,
} from "./character-chains.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Add / update title / update description / remove Chains on a character
 * draft. Mirrors `character-knives.ts`; see that file's header comment for
 * the rationale.
 */

export async function addCharacterChainAction(
  input: AddChainInput
): Promise<Result<AddChainSuccess, ChainActionError>> {
  const parsed = AddChainSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await addCharacterChain(
    character.id,
    parsed.data.title,
    parsed.data.description ?? null,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function updateCharacterChainTitleAction(
  input: UpdateChainTitleInput
): Promise<Result<CharacterChainPersistenceSuccess, ChainActionError>> {
  const parsed = UpdateChainTitleSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterChainTitle(
    character.id,
    parsed.data.chainId,
    parsed.data.title,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function updateCharacterChainDescriptionAction(
  input: UpdateChainDescriptionInput
): Promise<Result<CharacterChainPersistenceSuccess, ChainActionError>> {
  const parsed = UpdateChainDescriptionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterChainDescription(
    character.id,
    parsed.data.chainId,
    parsed.data.description.length === 0 ? null : parsed.data.description,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function removeCharacterChainAction(
  input: RemoveChainInput
): Promise<Result<CharacterChainPersistenceSuccess, ChainActionError>> {
  const parsed = RemoveChainSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await removeCharacterChain(
    character.id,
    parsed.data.chainId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
