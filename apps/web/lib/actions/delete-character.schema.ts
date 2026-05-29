import { z } from "zod/v4"

import type { DeleteCharacterPersistenceError } from "@/lib/db/writes/delete-character"

/**
 * Input schema for {@link deleteCharacterAction}. Lives in its own file
 * because a `"use server"` module can only export async functions — keeping
 * the schema here lets client components pre-validate the same way the
 * action will, before paying for a round-trip.
 *
 * `confirmationName` is the value the user typed into the type-to-confirm
 * dialog. Optional because unnamed drafts (UNN-219) skip the type-to-confirm
 * step — the action treats `confirmationName: undefined` against a row whose
 * `name` is empty as a valid discard. For named rows the action still
 * enforces the typed-name match, so a malformed direct call can't bypass
 * the gate.
 */
export const DeleteCharacterSchema = z.object({
  characterId: z.string().min(1),
  confirmationName: z.string().optional(),
})

export type DeleteCharacterInput = z.input<typeof DeleteCharacterSchema>

export type DeleteCharacterError =
  | "invalid-input"
  | "name-mismatch"
  | DeleteCharacterPersistenceError
