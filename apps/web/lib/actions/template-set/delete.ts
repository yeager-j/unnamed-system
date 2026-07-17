"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireTemplateSetOwner } from "@/lib/auth/template-set-access"
import { softDeleteTemplateSet } from "@/lib/db/writes/template-set"
import { stageSetsPath } from "@/lib/paths"

import {
  DeleteTemplateSetSchema,
  type DeleteTemplateSetError,
  type DeleteTemplateSetInput,
} from "./delete.schema"

/**
 * Soft-deletes a Template Set (UNN-588, owner-only). `requireTemplateSetOwner`
 * gates it; the write stamps `deletedAt` (house convention, like `dungeon`), so
 * every read drops the row while it survives for referential integrity.
 * Revalidates the Sets list; the client redirects to `/stage/sets`.
 *
 * **P2 seam:** once `region.templateSetId` exists (a `restrict` FK), this action
 * must refuse deletion when any Region references the set — a set in use
 * **tombstones** rather than vanishes (PRD, *Template Sets*). The restrict FK
 * never trips on a soft delete (the row stays), so the refusal is an explicit
 * application check to add here, not a DB error to catch.
 */
export async function deleteTemplateSetAction(
  input: DeleteTemplateSetInput
): Promise<Result<void, DeleteTemplateSetError>> {
  const parsed = DeleteTemplateSetSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const templateSet = await requireTemplateSetOwner(parsed.data.templateSetId)

  await softDeleteTemplateSet(templateSet.id)

  revalidatePath(stageSetsPath())
  return ok(undefined)
}
