"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  clearCharacterPortrait,
  setCharacterBuilderStep,
  updateCharacterPortraitUrl,
  updateCharacterPronouns,
  type CharacterIdentityPersistenceSuccess,
} from "@/lib/db/writes/identity"
import { uploadPortrait } from "@/lib/storage/portrait-upload"

import {
  RemoveCharacterPortraitSchema,
  SetBuilderStepSchema,
  UpdateCharacterPronounsSchema,
  type RemoveCharacterPortraitError,
  type RemoveCharacterPortraitInput,
  type SetBuilderStepError,
  type SetBuilderStepInput,
  type UpdateCharacterPronounsError,
  type UpdateCharacterPronounsInput,
  type UploadCharacterPortraitError,
} from "./character-identity.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * The four identity-class write surfaces the wizard composes with — grouped
 * here so the builder's many small "edit one identity field" actions don't
 * explode into a one-file-per-action sprawl. The existing
 * `updateCharacterNameAction` remains in its own file for now; folding it in
 * is a follow-up.
 *
 * Every action follows the canonical pattern documented in
 * `lib/actions/CLAUDE.md`: parse → `requireOwner` → persistence wrapper →
 * `revalidateCharacter` → return `Result`. Per-write-class versioning is
 * shared across all four — they all bump `identityVersion`, so two of them
 * in flight at the same time correctly race (one wins, the other gets
 * `"stale"` and is silently retried by the auto-save hook).
 */

export async function updateCharacterPronounsAction(
  input: UpdateCharacterPronounsInput
): Promise<
  Result<CharacterIdentityPersistenceSuccess, UpdateCharacterPronounsError>
> {
  const parsed = UpdateCharacterPronounsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterPronouns(
    character.id,
    parsed.data.pronouns,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function removeCharacterPortraitAction(
  input: RemoveCharacterPortraitInput
): Promise<
  Result<CharacterIdentityPersistenceSuccess, RemoveCharacterPortraitError>
> {
  const parsed = RemoveCharacterPortraitSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await clearCharacterPortrait(
    character.id,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function setBuilderStepAction(
  input: SetBuilderStepInput
): Promise<Result<CharacterIdentityPersistenceSuccess, SetBuilderStepError>> {
  const parsed = SetBuilderStepSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await setCharacterBuilderStep(
    character.id,
    parsed.data.step,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

/**
 * Portrait upload is a two-stage action: validate-and-store the file in
 * Vercel Blob, then point the row at the resulting URL. Errors from either
 * stage are surfaced via the same `Result` so the client can render one
 * unified toast path. The form pulls `characterId` and `expectedVersion`
 * out of the FormData as hidden inputs alongside the file.
 */
export async function uploadCharacterPortraitAction(
  formData: FormData
): Promise<
  Result<
    CharacterIdentityPersistenceSuccess & { url: string },
    UploadCharacterPortraitError
  >
> {
  const characterId = formData.get("characterId")
  const expectedVersionRaw = formData.get("expectedVersion")
  const file = formData.get("file")

  if (
    typeof characterId !== "string" ||
    typeof expectedVersionRaw !== "string" ||
    !(file instanceof File)
  ) {
    return err("invalid-input")
  }

  const expectedVersion = Number(expectedVersionRaw)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return err("invalid-input")
  }

  const character = await requireOwner(characterId)

  const uploaded = await uploadPortrait(file)
  if (!uploaded.ok) return uploaded

  const persisted = await updateCharacterPortraitUrl(
    character.id,
    uploaded.value.url,
    expectedVersion
  )

  if (!persisted.ok) return persisted

  revalidateCharacter(character)

  return {
    ok: true,
    value: { url: uploaded.value.url, version: persisted.value.version },
  }
}
