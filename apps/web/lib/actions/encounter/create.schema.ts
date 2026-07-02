import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create").createEncounterAction} (UNN-335).
 * A new encounter is scoped to a campaign and given a name; the roster starts
 * empty (a bare v2 session mint, UNN-535) and is populated during setup
 * (UNN-298/300/301) through the combat wire. The `{ encounterId,
 * expectedVersion }` envelope the rest of the aggregate uses doesn't apply
 * here — create has no prior version to guard against.
 */
export const CreateEncounterSchema = z.object({
  campaignId: z.string(),
  name: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(2000).optional(),
})

export type CreateEncounterInput = z.input<typeof CreateEncounterSchema>

export type CreateEncounterError = "invalid-input"
