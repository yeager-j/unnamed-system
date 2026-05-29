import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

/**
 * Input schema for the Healer — Path of Dawn Dawn Mode toggle (UNN-230). The
 * action takes the target boolean; the server reads the row and sets the flag.
 */
export const SetDawnModeSchema = z.object({
  characterId: z.string().min(1),
  dawnMode: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
})

export type SetDawnModeInput = z.input<typeof SetDawnModeSchema>

export type SetDawnModeError = "invalid-input" | MechanicPersistenceError
