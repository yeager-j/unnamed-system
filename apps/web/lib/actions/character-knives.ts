"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  addCharacterKnife,
  removeCharacterKnife,
  updateCharacterKnifeDescription,
  updateCharacterKnifeTitle,
  type AddKnifeSuccess,
  type CharacterKnifePersistenceSuccess,
} from "@/lib/db/writes/knives"
import { err, type Result } from "@/lib/result"

import {
  AddKnifeSchema,
  RemoveKnifeSchema,
  UpdateKnifeDescriptionSchema,
  UpdateKnifeTitleSchema,
  type AddKnifeInput,
  type KnifeActionError,
  type RemoveKnifeInput,
  type UpdateKnifeDescriptionInput,
  type UpdateKnifeTitleInput,
} from "./character-knives.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Add / update title / update description / remove Knives on a character
 * draft. All four are identity-class. Title + description are separate
 * actions so the editor's two debounced auto-saves don't write each other's
 * stale snapshots — see schema header for the race rationale.
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

export async function updateCharacterKnifeTitleAction(
  input: UpdateKnifeTitleInput
): Promise<Result<CharacterKnifePersistenceSuccess, KnifeActionError>> {
  const parsed = UpdateKnifeTitleSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterKnifeTitle(
    character.id,
    parsed.data.knifeId,
    parsed.data.title,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function updateCharacterKnifeDescriptionAction(
  input: UpdateKnifeDescriptionInput
): Promise<Result<CharacterKnifePersistenceSuccess, KnifeActionError>> {
  const parsed = UpdateKnifeDescriptionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterKnifeDescription(
    character.id,
    parsed.data.knifeId,
    parsed.data.description.length === 0 ? null : parsed.data.description,
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
