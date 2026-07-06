import "server-only"

import { revalidatePath } from "next/cache"

import type { EntityStatus } from "@/lib/db/schema/entity"

/**
 * Centralized cache invalidation for the entity-backed character surfaces
 * (the `revalidateCharacter` twin). Every column action and lifecycle write
 * calls this on success: My Characters (`/`) always — its cards render name /
 * portrait / status / builder step — and the builder subtree while the row is
 * still a draft, so the wizard's server-rendered gate props stay current. The
 * v2 sheet route joins here when S2a lands.
 */
export function revalidateEntity(row: {
  shortId: string
  status: EntityStatus
}): void {
  revalidatePath("/")
  if (row.status === "draft") {
    revalidatePath(`/builder/${row.shortId}`, "layout")
  }
}
