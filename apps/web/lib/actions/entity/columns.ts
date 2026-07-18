"use server"

import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/result"

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
  type UploadEntityPortraitError,
} from "./columns.schema"
import { makeOwnerFieldAction } from "./owner-field-action"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"
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
 *
 * UNN-648 moves name/pronouns/notes/portrait-removal callers onto the replica's
 * `entity.setColumn` mutation. These guarded actions remain temporarily as
 * expand/rollback-compatible readers of the old wire and are removed by
 * UNN-649. Portrait upload remains here because its Blob stage is deliberately
 * single-attempt and preconditioned.
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

export const updateEntityNameAction = makeOwnerFieldAction(
  UpdateEntityNameSchema,
  async (row, input) => {
    const result = await commitColumnPatch(row, input.expectedVersion, {
      name: input.name,
    })
    if (result.ok) revalidateCharacterList()
    return result
  }
)

export const updateEntityPronounsAction = makeOwnerFieldAction(
  UpdateEntityPronounsSchema,
  (row, input) =>
    commitColumnPatch(row, input.expectedVersion, {
      pronouns: input.pronouns.trim() || null,
    })
)

/**
 * The free-form Notes column. Owner-gated like every other column action, but
 * unlike name, an empty body is legitimate — a cleared note canonicalizes to
 * `null` (mirroring the narrative prose fields' empty→null rule) rather than
 * being rejected.
 */
export const updateEntityNotesAction = makeOwnerFieldAction(
  UpdateEntityNotesSchema,
  (row, input) =>
    commitColumnPatch(row, input.expectedVersion, {
      notes: input.notes === "" ? null : input.notes,
    })
)

/**
 * Advances (or rewinds) the builder step — an **unguarded** write to the PC
 * subtype (R3 — UNN-573): `builderStep` lives on `playerCharacter`, not the
 * version-tokened `entity` row, so this is a plain LWW update with no
 * `expectedVersion` and no version bump. Single-author builder navigation; keeping
 * it off the identity class means a step advance can't falsely stale an in-flight
 * name autosave.
 */
export const setEntityBuilderStepAction = makeOwnerFieldAction(
  SetEntityBuilderStepSchema,
  async (row, input) => {
    const updated = await db
      .update(playerCharacter)
      .set({ builderStep: input.step })
      .where(eq(playerCharacter.entityId, row.id))
      .returning({ id: playerCharacter.entityId })
    if (updated.length === 0) return err("entity-not-found")

    revalidateEntity(row)
    revalidateCharacterList()
    return ok(undefined)
  }
)

export const removeEntityPortraitAction = makeOwnerFieldAction(
  RemoveEntityPortraitSchema,
  async (row, input) => {
    const result = await commitColumnPatch(row, input.expectedVersion, {
      portraitUrl: null,
    })
    if (result.ok) revalidateCharacterList()
    return result
  }
)

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

  revalidateCharacterList()
  return ok({ version: committed.value.version, url: uploaded.value.url })
}
