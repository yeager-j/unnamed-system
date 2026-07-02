import { z } from "zod/v4"

/**
 * Input schema for {@link import("./vitals-version").getCombatantVitalsVersionAction}
 * — the durable-arm stale-retry read (UNN-535). Keyed on the character row id
 * (the id the write-router's durable arm targets), not a shortId: the caller is
 * the DM console, which already holds it from `participantMeta`.
 */
export const GetCombatantVitalsVersionSchema = z.object({
  characterId: z.string().min(1),
})

export type GetCombatantVitalsVersionInput = z.input<
  typeof GetCombatantVitalsVersionSchema
>

export type CombatantVitalsVersionError =
  | "invalid-input"
  | "character-not-found"
