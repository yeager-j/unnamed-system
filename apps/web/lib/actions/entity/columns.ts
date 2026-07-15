"use server"

import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type { EntityColumnPatch } from "@/lib/actions/entity/version-guard"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import type { EntityRow } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { uploadPortrait } from "@/lib/storage/portrait-upload"

import {
  RemoveEntityPortraitSchema,
  SetEntityBuilderStepSchema,
  UpdateEntityNameSchema,
  UpdateEntityNotesSchema,
  UpdateEntityPronounsSchema,
  type EntityColumnActionError,
  type RemoveEntityPortraitInput,
  type SetEntityBuilderStepError,
  type SetEntityBuilderStepInput,
  type UpdateEntityNameInput,
  type UpdateEntityNotesInput,
  type UpdateEntityPronounsInput,
  type UploadEntityPortraitError,
} from "./columns.schema"
import { revalidateEntity } from "./revalidate"
import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * The app-column write species (ADR §2.4): per-field Server Actions over the
 * entity row's substrate content columns — name, pronouns, portrait. The other
 * species (engine-component state) rides the descriptor router
 * (`apply-entity-write.ts`); the distinction is the D35 column/component storage
 * projection surfacing at the write layer, decided once here. These three gate on
 * the strict owner and bump the **identity** class. Builder step is the odd one
 * out — it lives on the `playerCharacter` door and writes unguarded (see
 * {@link setEntityBuilderStepAction}).
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

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    name: parsed.data.name,
  })
}

export async function updateEntityPronounsAction(
  input: UpdateEntityPronounsInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = UpdateEntityPronounsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    pronouns: parsed.data.pronouns.trim() || null,
  })
}

/**
 * The free-form Notes column. Owner-gated like every other column action, but
 * unlike name, an empty body is legitimate — a cleared note canonicalizes to
 * `null` (mirroring the narrative prose fields' empty→null rule) rather than
 * being rejected.
 */
export async function updateEntityNotesAction(
  input: UpdateEntityNotesInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = UpdateEntityNotesSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)
  return commitColumnPatch(row, parsed.data.expectedVersion, {
    notes: parsed.data.notes === "" ? null : parsed.data.notes,
  })
}

/**
 * Advances (or rewinds) the builder step — an **unguarded** write to the PC
 * subtype (R3 — UNN-573): `builderStep` lives on `playerCharacter`, not the
 * version-tokened `entity` row, so this is a plain LWW update with no
 * `expectedVersion` and no version bump. Single-author builder navigation; keeping
 * it off the identity class means a step advance can't falsely stale an in-flight
 * name autosave.
 */
export async function setEntityBuilderStepAction(
  input: SetEntityBuilderStepInput
): Promise<Result<void, SetEntityBuilderStepError>> {
  const parsed = SetEntityBuilderStepSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)

  const updated = await db
    .update(playerCharacter)
    .set({ builderStep: parsed.data.step })
    .where(eq(playerCharacter.entityId, row.id))
    .returning({ id: playerCharacter.entityId })
  if (updated.length === 0) return err("entity-not-found")

  revalidateEntity(row)
  return ok(undefined)
}

export async function removeEntityPortraitAction(
  input: RemoveEntityPortraitInput
): Promise<Result<EntityColumnCommit, EntityColumnActionError>> {
  const parsed = RemoveEntityPortraitSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)
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

  const { entity: row } = await requireEntityOwner(entityId)

  const uploaded = await uploadPortrait(file)
  if (!uploaded.ok) return uploaded

  const committed = await commitColumnPatch(row, expectedVersion, {
    portraitUrl: uploaded.value.url,
  })
  if (!committed.ok) return committed

  return ok({ version: committed.value.version, url: uploaded.value.url })
}
