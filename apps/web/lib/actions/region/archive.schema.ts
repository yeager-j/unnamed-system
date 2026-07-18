import { z } from "zod/v4"

/**
 * Input schema for {@link import("./archive").archiveRegionAction} (UNN-589).
 * Archiving hides a Region from campaign discovery surfaces while its row (and any
 * expedition history) survives — so it carries the single-`version` token, guarded
 * like the settings write (a stale archive over a concurrent rename must not
 * silently drop the rename). No type-to-confirm: archive is reversible in intent
 * (the row lives on), unlike a hard delete.
 */
export const ArchiveRegionSchema = z.object({
  regionId: z.string(),
  expectedVersion: z.number().int().min(0),
})

export type ArchiveRegionInput = z.input<typeof ArchiveRegionSchema>

export type ArchiveRegionError = "invalid-input" | "region-not-found" | "stale"
