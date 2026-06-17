import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create-map").createMapAction} (UNN-460). A
 * Map needs a name up front; the geometry starts empty and is autosaved by the
 * editor. The owner is the signed-in caller, not an input field, and the
 * `shortId` is minted server-side — so neither is accepted here.
 */
export const CreateMapSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export type CreateMapInput = z.input<typeof CreateMapSchema>

export type CreateMapError = "invalid-input"
