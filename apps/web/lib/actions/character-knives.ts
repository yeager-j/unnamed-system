"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addCharacterKnife,
  removeCharacterKnife,
  updateCharacterKnife,
  type AddKnifeSuccess,
  type CharacterKnifePersistenceSuccess,
} from "@/lib/db/character-knives"
import { err, type Result } from "@/lib/game/result"

import {
  AddKnifeSchema,
  RemoveKnifeSchema,
  UpdateKnifeSchema,
  type AddKnifeInput,
  type KnifeActionError,
  type RemoveKnifeInput,
  type UpdateKnifeInput,
} from "./character-knives.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Add / update / remove Knives on a character draft. All three are
 * identity-class — they share `identityVersion` with name/pronouns/narrative
 * edits, so a debounced description blur racing the Backstory save correctly
 * stales and is silently retried by the UNN-203 pipeline.
 */

export async function addCharacterKnifeAction(
  input: AddKnifeInput
): Promise<Result<AddKnifeSuccess, KnifeActionError>> {
  const parsed = AddKnifeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await addCharacterKnife(
    character.id,
    parsed.data.title,
    parsed.data.description ?? null,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function updateCharacterKnifeAction(
  input: UpdateKnifeInput
): Promise<Result<CharacterKnifePersistenceSuccess, KnifeActionError>> {
  const parsed = UpdateKnifeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterKnife(
    character.id,
    parsed.data.knifeId,
    parsed.data.title,
    parsed.data.description ?? null,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function removeCharacterKnifeAction(
  input: RemoveKnifeInput
): Promise<Result<CharacterKnifePersistenceSuccess, KnifeActionError>> {
  const parsed = RemoveKnifeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await removeCharacterKnife(
    character.id,
    parsed.data.knifeId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
