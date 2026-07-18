import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete").deleteRegionAction} (UNN-589). A hard
 * delete, legal **only** in the zero-expedition mistake case (once any expedition
 * exists, `dungeon.regionId`'s FK makes deletion impossible and the DM archives
 * instead). No `expectedVersion`: a single-row delete of a Region with no
 * dependents has no concurrent-write to guard against — the expedition check is the
 * gate, and the FK is the backstop.
 */
export const DeleteRegionSchema = z.object({
  regionId: z.string(),
})

export type DeleteRegionInput = z.input<typeof DeleteRegionSchema>

export type DeleteRegionError =
  | "invalid-input"
  | "region-not-found"
  | "region-has-expeditions"
