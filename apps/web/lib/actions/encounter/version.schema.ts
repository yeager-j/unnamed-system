import { z } from "zod/v4"

/**
 * Input schema for {@link getEncounterVersionAction}. Keyed on the encounter's
 * **public `shortId`** — both the DM console and the player watch view hold the
 * shortId, and the version token is non-sensitive, so this read needs no
 * internal id and no DM gate.
 */
export const GetEncounterVersionSchema = z.object({
  shortId: z.string().min(1),
})

export type GetEncounterVersionInput = z.input<typeof GetEncounterVersionSchema>

/** A malformed payload lands as `invalid-input`; a missing row as
 *  `encounter-not-found`. */
export type GetEncounterVersionError = "invalid-input" | "encounter-not-found"
