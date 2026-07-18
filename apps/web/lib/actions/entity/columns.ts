"use server"

import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { uploadPortrait } from "@/lib/storage/portrait-upload"

import {
  SetEntityBuilderStepSchema,
  type UploadEntityPortraitError,
} from "./columns.schema"
import { makeOwnerFieldAction } from "./owner-field-action"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"
import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * The two app-column writes that deliberately stay outside the replica
 * (UNN-648/649): builder step is an unversioned subtype LWW action; portrait
 * upload has a non-replayable Blob stage and commits once against the fresh
 * identity precondition captured by the provider. Replayable name, pronouns,
 * notes, and portrait-removal intent uses `entity.setColumn` instead.
 */

interface EntityColumnCommit {
  version: number
}

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

  const committed = await bumpEntityVersionGuarded(
    row.id,
    "identity",
    expectedVersion,
    { portraitUrl: uploaded.value.url }
  )
  if (!committed.ok) return committed

  revalidateEntity(row)
  revalidateCharacterList()
  return ok({ version: committed.value.version, url: uploaded.value.url })
}
