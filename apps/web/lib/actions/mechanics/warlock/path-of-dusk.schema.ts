import { z } from "zod/v4"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

import { characterMutationBase } from "../../character-mutation.schema"

/**
 * Input schema for the Warlock — Path of Dusk Dusk Mode toggle (UNN-230). The
 * action takes the target boolean; the server reads the row and sets the flag.
 */
export const SetDuskModeSchema = characterMutationBase.extend({
  duskMode: z.boolean(),
})

export type SetDuskModeInput = z.input<typeof SetDuskModeSchema>

export type SetDuskModeError = "invalid-input" | MechanicPersistenceError
