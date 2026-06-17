"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireMapOwner } from "@/lib/auth/map-access"
import { renameMap, saveMapGeometry } from "@/lib/db/writes/map"

import {
  SaveMapSchema,
  type SaveMapError,
  type SaveMapInput,
} from "./save-map.schema"

/**
 * Autosaves a Map field (UNN-460, owner-only). `requireMapOwner` gates the write;
 * the discriminated `patch` routes to the matching version-guarded write
 * (`renameMap` / `saveMapGeometry`), which bumps `version` and returns the new
 * token so the client's optimistic ref advances. A `"stale"` result means a
 * concurrent save moved the token — the client refetches and retries. No
 * `revalidatePath`: the editor renders the optimistic value and the version
 * round-trip keeps it honest (mirrors the character free-text autosave).
 */
export async function saveMapAction(
  input: SaveMapInput
): Promise<Result<{ version: number }, SaveMapError>> {
  const parsed = SaveMapSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { mapId, expectedVersion, patch } = parsed.data
  const map = await requireMapOwner(mapId)

  return patch.field === "name"
    ? renameMap(map.id, patch.name, expectedVersion)
    : saveMapGeometry(map.id, patch.geometry, expectedVersion)
}
