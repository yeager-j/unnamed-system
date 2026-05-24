import { z } from "zod/v4"

/**
 * Input schema for {@link getCharacterVersionsAction}. Lives in its own file
 * because a `"use server"` module can only export async functions.
 */
export const GetCharacterVersionsSchema = z.object({
  characterId: z.string().min(1),
})

export type GetCharacterVersionsInput = z.input<
  typeof GetCharacterVersionsSchema
>

export type GetCharacterVersionsError = "invalid-input" | "character-not-found"
