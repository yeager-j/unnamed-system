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
 * gates the write; the discriminated `patch` routes to the matching
 * version-guarded write (`renameTemplateSet` / `saveTemplateSetContent`), which
 * bumps `version` and returns the new token so the client's optimistic ref
 * advances. A `"stale"` result means a concurrent save moved the token (cross-tab
 * only — Set authoring is single-owner); the editor hook surfaces it by reverting
 * the field + a toast. No `revalidatePath`: the editor renders the optimistic
 * value and the version round-trip keeps it honest (same rationale as
 * `saveMapAction`).
 */
export async function saveTemplateSetAction(
  input: SaveTemplateSetInput
): Promise<Result<{ version: number }, SaveTemplateSetError>> {
  const parsed = SaveTemplateSetSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { templateSetId, expectedVersion, patch } = parsed.data
  const templateSet = await requireTemplateSetOwner(templateSetId)

  return patch.field === "name"
    ? renameTemplateSet(templateSet.id, patch.name, expectedVersion)
    : saveTemplateSetContent(templateSet.id, patch.content, expectedVersion)
}
