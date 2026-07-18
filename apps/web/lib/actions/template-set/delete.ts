"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireTemplateSetOwner } from "@/lib/auth/template-set-access"
import { regionReferencesTemplateSet } from "@/lib/db/queries/load-region"
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
 * **In-use refusal (UNN-589):** `region.templateSetId` is a `restrict` FK, but a
 * soft delete never trips it (the row stays), so the refusal is an explicit
 * application check — a set any Region rolls from can't leave the library
 * (`template-set-in-use`). {@link regionReferencesTemplateSet} sees every Region,
 * including those bound to the (already tombstoned) set, so a referenced set
 * tombstones rather than vanishes (PRD, *Template Sets*).
 */
export async function deleteTemplateSetAction(
  input: DeleteTemplateSetInput
): Promise<Result<void, DeleteTemplateSetError>> {
  const parsed = DeleteTemplateSetSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const templateSet = await requireTemplateSetOwner(parsed.data.templateSetId)

  if (await regionReferencesTemplateSet(templateSet.id)) {
    return err("template-set-in-use")
  }

  await softDeleteTemplateSet(templateSet.id)

  revalidatePath(stageSetsPath())
  return ok(undefined)
}
