"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireMapOwner } from "@/lib/auth/map-access"
import { deleteMap } from "@/lib/db/writes/map"

import {
  DeleteMapSchema,
  type DeleteMapError,
  type DeleteMapInput,
} from "./delete-map.schema"

/**
 * Deletes a Map (UNN-460, owner-only). `requireMapOwner` gates it; the delete is
 * a plain `DELETE` (the `mapInstance.mapId` FK is `set null`, so any minted
 * Instance survives with `mapId = null` — snapshot isolation). Revalidates the My
 * Maps list; the client redirects to `/maps`.
 */
export async function deleteMapAction(
  input: DeleteMapInput
): Promise<Result<void, DeleteMapError>> {
  const parsed = DeleteMapSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const map = await requireMapOwner(parsed.data.mapId)

  await deleteMap(map.id)

  revalidatePath("/maps")
  return ok(undefined)
}
