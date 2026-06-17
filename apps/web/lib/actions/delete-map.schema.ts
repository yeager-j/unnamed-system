import { z } from "zod/v4"

/**
 * Input schema for {@link import("./delete-map").deleteMapAction} (UNN-460).
 * Deleting a Map is low-stakes (it's a template; the `mapInstance.mapId` FK is
 * `set null`, so any minted Instance survives), so a simple confirm dialog
 * suffices — no type-to-confirm, unlike campaign/character deletion.
 */
export const DeleteMapSchema = z.object({
  mapId: z.string(),
})

export type DeleteMapInput = z.input<typeof DeleteMapSchema>

export type DeleteMapError = "invalid-input"
