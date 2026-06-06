import { z } from "zod/v4"

import { PATH_CHOICES } from "@workspace/game/foundation"

import type { CharacterPathPersistenceError } from "@/lib/db/writes/path"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schema for {@link updateCharacterPathAction}. Lives in its own file
 * so client components can pre-validate the same way the action will, before
 * paying for a round-trip (a `"use server"` module can only export async
 * functions, so co-locating the schema there is not possible).
 */
export const UpdateCharacterPathSchema = characterMutationBase.extend({
  pathChoice: z.enum(PATH_CHOICES),
})

export type UpdateCharacterPathInput = z.input<typeof UpdateCharacterPathSchema>

export type UpdateCharacterPathError =
  | "invalid-input"
  | CharacterPathPersistenceError
