import "server-only"

import { revalidatePath } from "next/cache"

import type { EntityStatus } from "@/lib/db/schema/entity"
import { characterPath } from "@/lib/paths"

/**
 * Centralized cache invalidation for the entity-backed character surfaces
 * (the `revalidateCharacter` twin). Every column action and lifecycle write
 * calls this on success: My Characters (`/`) always — its cards render name /
 * portrait / status / builder step — plus a `"layout"` revalidation of the
 * character subtree, which since UNN-608 nests both the sheet (finalized) and
 * the builder wizard (draft) under `/characters/{shortId}`, so one call keeps
 * the draft's gate props and the finalized provider's base frame current.
 */
export function revalidateEntity(row: {
  shortId: string
  status: EntityStatus
}): void {
  revalidatePath("/")
  revalidatePath(characterPath(row.shortId), "layout")
}
