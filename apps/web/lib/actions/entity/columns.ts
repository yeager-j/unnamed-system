"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type { EntityColumnPatch } from "@/lib/actions/entity/version-guard"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import type { EntityRow } from "@/lib/db/schema/entity"
import { uploadPortrait } from "@/lib/storage/portrait-upload"

import {
  RemoveEntityPortraitSchema,
  SetEntityBuilderStepSchema,
  UpdateEntityNameSchema,
  UpdateEntityPronounsSchema,
  type EntityColumnActionError,
  type RemoveEntityPortraitInput,
  type SetEntityBuilderStepInput,
  type UpdateEntityNameInput,
  type UpdateEntityPronounsInput,
  type UploadEntityPortraitError,
} from "./columns.schema"
import { revalidateEntity } from "./revalidate"
import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * The app-column write species (ADR §2.4): per-field Server Actions over the
 * entity row's app-owned columns — name, pronouns, portrait, builder step. The
 * other species (engine-component state) rides the descriptor router
 * (`apply-entity-write.ts`); the distinction is the D35 column/component
 * storage projection surfacing at the write layer, decided once here. All four
 * gate on the strict owner and bump the **identity** class.
 */

interface EntityColumnCommit {
  version: number
}

/** The guarded UPDATE + revalidation shared by every column action; the caller
 *  has already gated ownership and holds the loaded row. */
async function commitColumnPatch(
  row: EntityRow,
  expectedVersion: number,
  patch: EntityColumnPatch
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const result = await bumpEntityVersionGuarded(
    row.id,
    "identity",
    expectedVersion,
    patch
  )
  if (!result.ok) return result

  revalidateEntity(row)
  return ok({ version: result.value.version })
}

export async function updateEntityNameAction(
  input: UpdateEntityNameInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = UpdateEntityNameSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    name: parsed.data.name,
  })
}

export async function updateEntityPronounsAction(
  input: UpdateEntityPronounsInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = UpdateEntityPronounsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    pronouns: parsed.data.pronouns.trim() || null,
  })
}

export async function setEntityBuilderStepAction(
  input: SetEntityBuilderStepInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = SetEntityBuilderStepSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    builderStep: parsed.data.step,
  })
}

export async function removeEntityPortraitAction(
  input: RemoveEntityPortraitInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = RemoveEntityPortraitSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    portraitUrl: null,
  })
}

/**
 * Portrait upload is a two-stage action (v1 parity): validate-and-store the
 * file in Vercel Blob, then point the row at the resulting URL — ownership is
 * gated before the Blob ever sees the file. The form pulls `entityId` and
 * `expectedVersion` out of the FormData as hidden inputs alongside the file.
 */
export async function uploadEntityPortraitAction(
  formData: FormData
): Promise<
  Result<EntityColumnCommit & { url: string }, UploadEntityPortraitError>
> {
  const entityId = formData.get("entityId")
  const expectedVersionRaw = formData.get("expectedVersion")
  const file = formData.get("file")

  if (
    typeof entityId !== "string" ||
    typeof expectedVersionRaw !== "string" ||
    !(file instanceof File)
  ) {
    return err("invalid-input")
  }

  const expectedVersion = Number(expectedVersionRaw)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return err("invalid-input")
  }

  const row = await requireEntityOwner(entityId)

  const uploaded = await uploadPortrait(file)
  if (!uploaded.ok) return uploaded

  const committed = await commitColumnPatch(row, expectedVersion, {
    portraitUrl: uploaded.value.url,
  })
  if (!committed.ok) return committed

  return ok({ version: committed.value.version, url: uploaded.value.url })
}
