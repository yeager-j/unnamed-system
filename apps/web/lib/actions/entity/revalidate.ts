import "server-only"

import { revalidatePath } from "next/cache"

import { characterPath } from "@/lib/paths"

/**
 * Revalidate the entity-backed character subtree. Since UNN-608 the sheet and
 * builder both live below `/characters/{shortId}`, so one layout invalidation
 * catches the optimistic provider's base and the builder's gate props up.
 */
export function revalidateEntity(row: { shortId: string }): void {
  revalidatePath(characterPath(row.shortId), "layout")
}

/** Revalidate My Characters only when a mutation touches its summary fields. */
export function revalidateCharacterList(): void {
  revalidatePath("/")
}
