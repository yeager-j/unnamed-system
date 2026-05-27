import { z } from "zod/v4"

import type { CharacterPathPersistenceError } from "@/lib/db/character-path"
import { PATH_CHOICES } from "@/lib/game/character/state"

/**
 * Input schema for {@link updateCharacterPathAction}. Lives in its own file
 * so client components can pre-validate the same way the action will, before
 * paying for a round-trip (a `"use server"` module can only export async
 * functions, so co-locating the schema there is not possible).
 */
export const UpdateCharacterPathSchema = z.object({
  characterId: z.string().min(1),
  pathChoice: z.enum(PATH_CHOICES),
  expectedVersion: z.number().int().nonnegative(),
})

export type UpdateCharacterPathInput = z.input<typeof UpdateCharacterPathSchema>

export type UpdateCharacterPathError =
  | "invalid-input"
  | CharacterPathPersistenceError
