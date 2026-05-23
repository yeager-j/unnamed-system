import { z } from "zod/v4"

import type { DeleteCharacterPersistenceError } from "@/lib/db/delete-character"

/**
 * Input schema for {@link deleteCharacterAction}. Lives in its own file
 * because a `"use server"` module can only export async functions — keeping
 * the schema here lets client components pre-validate the same way the
 * action will, before paying for a round-trip.
 *
 * `confirmationName` is the value the user typed into the type-to-confirm
 * dialog. The schema only checks it is non-empty; the action compares it to
 * the loaded character's actual name, so a malformed direct call can't
 * bypass the gate.
 */
export const DeleteCharacterSchema = z.object({
  characterId: z.string().min(1),
  confirmationName: z.string().trim().min(1),
})

export type DeleteCharacterInput = z.input<typeof DeleteCharacterSchema>

export type DeleteCharacterError =
  | "invalid-input"
  | "name-mismatch"
  | DeleteCharacterPersistenceError
