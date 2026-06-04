import { z } from "zod/v4"

/**
 * Input schema for {@link import("./create").createEncounterAction} (UNN-335).
 * A new encounter is scoped to a campaign and given a name; the combatant roster
 * starts empty (`createCombatSession([])`) and is populated during setup
 * (UNN-298/300/301). The `{ encounterId, expectedVersion }` envelope the rest of
 * the encounter aggregate uses (`events.schema.ts`) doesn't apply here — create
 * has no prior version to guard against.
 */
export const CreateEncounterSchema = z.object({
  campaignId: z.string(),
  name: z.string().min(1),
  notes: z.string().trim().max(2000).optional(),
})

export type CreateEncounterInput = z.input<typeof CreateEncounterSchema>

export type CreateEncounterError = "invalid-input"
