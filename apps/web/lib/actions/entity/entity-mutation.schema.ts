import { z } from "zod/v4"

/**
 * The entity aggregate's owner-mode envelope (the `characterMutationBase`
 * twin): the row it targets plus the per-write-class version token the guard
 * checks. Column-action schemas extend this with their field; the descriptor
 * router's own envelope (`apply-entity-write.schema.ts`) carries the same pair
 * around its `write`.
 */
export const entityMutationBase = z.object({
  entityId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
