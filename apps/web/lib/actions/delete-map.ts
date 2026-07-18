"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireMapOwner } from "@/lib/auth/map-access"
import { regionReferencesMap } from "@/lib/db/queries/load-region"
import { deleteMap } from "@/lib/db/writes/map"
import { stageMapsPath } from "@/lib/paths"

import {
  DeleteMapSchema,
  type DeleteMapError,
  type DeleteMapInput,
} from "./delete-map.schema"

/**
 * Deletes a Map (UNN-460, owner-only). `requireMapOwner` gates it; the delete is
 * a plain `DELETE` (the `mapInstance.mapId` FK is `set null`, so any minted
 * Instance survives with `mapId = null` — snapshot isolation). Revalidates the My
 * Maps list; the client redirects to `/stage/maps`.
 *
 * **In-use refusal (UNN-589):** `region.seedMapId` is a `restrict` FK, so a Map any
 * Region seeds from can't hard-delete — the DB would raise, surfacing as a 500. The
 * app refuses first with `map-in-use` ({@link regionReferencesMap}), turning the
 * restrict FK's backstop into a clean domain error.
 */
export async function deleteMapAction(
  input: DeleteMapInput
): Promise<Result<void, DeleteMapError>> {
  const parsed = DeleteMapSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const map = await requireMapOwner(parsed.data.mapId)

  if (await regionReferencesMap(map.id)) return err("map-in-use")

  await deleteMap(map.id)

  revalidatePath(stageMapsPath())
  return ok(undefined)
}
