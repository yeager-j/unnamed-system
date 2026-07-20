"use server"

import { err, type Result } from "@workspace/result"

import { requireTemplateSetOwner } from "@/lib/auth/template-set-access"
import {
  renameTemplateSet,
  saveTemplateSetContent,
} from "@/lib/db/writes/template-set"

import {
  SaveTemplateSetSchema,
  type SaveTemplateSetError,
  type SaveTemplateSetInput,
} from "./save.schema"

/**
 * Autosaves a Template Set field (UNN-588, owner-only). `requireTemplateSetOwner`
 * gates the write; the discriminated `patch` routes to the matching field-scoped
 * LWW write (`renameTemplateSet` / `saveTemplateSetContent`). Set authoring is
 * single-owner; this tab serializes saves while concurrent tabs deliberately
 * resolve in database update order. No `revalidatePath`: the editor owns the
 * draft it just persisted.
 */
export async function saveTemplateSetAction(
  input: SaveTemplateSetInput
): Promise<Result<void, SaveTemplateSetError>> {
  const parsed = SaveTemplateSetSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { templateSetId, patch } = parsed.data
  const templateSet = await requireTemplateSetOwner(templateSetId)

  return patch.field === "name"
    ? renameTemplateSet(templateSet.id, patch.name)
    : saveTemplateSetContent(templateSet.id, patch.content)
}
