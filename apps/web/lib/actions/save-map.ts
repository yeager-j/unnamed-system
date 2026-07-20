"use server"

import { err, type Result } from "@workspace/result"

import { requireMapOwner } from "@/lib/auth/map-access"
import { renameMap, saveMapGeometry } from "@/lib/db/writes/map"

import {
  SaveMapSchema,
  type SaveMapError,
  type SaveMapInput,
} from "./save-map.schema"

/**
 * Autosaves a Map field (UNN-460, owner-only). `requireMapOwner` gates the write;
 * the discriminated `patch` routes to the matching field-scoped LWW write
 * (`renameMap` / `saveMapGeometry`). Map authoring is single-owner; this tab
 * serializes saves while concurrent tabs deliberately resolve in database update
 * order. No `revalidatePath`: the editor owns the draft it just persisted.
 */
export async function saveMapAction(
  input: SaveMapInput
): Promise<Result<void, SaveMapError>> {
  const parsed = SaveMapSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { mapId, patch } = parsed.data
  const map = await requireMapOwner(mapId)

  return patch.field === "name"
    ? renameMap(map.id, patch.name)
    : saveMapGeometry(map.id, patch.geometry)
}
