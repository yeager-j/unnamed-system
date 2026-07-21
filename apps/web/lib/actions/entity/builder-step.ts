"use server"

import { eq } from "drizzle-orm"

import { err, ok } from "@workspace/result"

import { db } from "@/lib/db/client"
import { playerCharacter } from "@/lib/db/schema/player-character"

import { SetEntityBuilderStepSchema } from "./builder-step.schema"
import { makeOwnerFieldAction } from "./owner-field-action"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"

/**
 * Advances (or rewinds) the builder step — an **unguarded** write to the PC
 * subtype (R3 — UNN-573): `builderStep` lives on `playerCharacter`, not the
 * version-tokened `entity` row, so this is a plain LWW update with no expected
 * revision and no version bump. Single-author builder navigation.
 *
 * The last owner-gated per-field action on this aggregate. Its siblings — the
 * identity columns — became one registered mutation in UNN-675; this one did not
 * follow, because a write that advances no modeled version column has no axis to
 * stamp, no cache tag to expire, and nothing for another view to reconcile
 * against.
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
