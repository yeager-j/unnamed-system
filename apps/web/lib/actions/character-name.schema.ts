import { z } from "zod/v4"

import type { CharacterNamePersistenceError } from "@/lib/db/character-name"

/**
 * Input schema for {@link updateCharacterNameAction}. Lives in its own file
 * because a `"use server"` module can only export async functions — keeping
 * the schema here lets client components pre-validate the same way the
 * action will, before paying for a round-trip.
 *
 * Bounds chosen to match what the sheet header can render cleanly. Trimmed
 * before persistence — leading/trailing whitespace is never meaningful.
 */
export const UpdateCharacterNameSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(64),
  expectedUpdatedAt: z.coerce.date(),
})

export type UpdateCharacterNameInput = z.input<typeof UpdateCharacterNameSchema>

export type UpdateCharacterNameError =
  | "invalid-input"
  | CharacterNamePersistenceError
