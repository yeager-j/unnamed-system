"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod/v4"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  updateCharacterName,
  type CharacterNamePersistenceError,
} from "@/lib/db/character-name"
import { type Result } from "@/lib/game/result"

/**
 * The canonical Server Action: typed input → Zod parse → `requireOwner` →
 * persistence call → `revalidatePath` → return `Result`. Every owner-mode
 * write follows the same shape (see `lib/actions/README.md`).
 */

/**
 * Bounds chosen to match what the sheet header can render cleanly. Trimmed
 * before persistence — leading/trailing whitespace is never meaningful.
 * Schemas are kept module-private because a `"use server"` file can only
 * export async functions.
 */
const UpdateCharacterNameSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(64),
  expectedUpdatedAt: z.coerce.date(),
})

type UpdateCharacterNameInput = z.input<typeof UpdateCharacterNameSchema>

type UpdateCharacterNameError = "invalid-input" | CharacterNamePersistenceError

/**
 * Updates the character's display name. The viewer must be the owner; a
 * non-owner caller never reaches the persistence layer (the gate trips
 * Next's `forbidden()`).
 */
export async function updateCharacterNameAction(
  input: UpdateCharacterNameInput
): Promise<
  Result<{ name: string; updatedAt: Date }, UpdateCharacterNameError>
> {
  const parsed = UpdateCharacterNameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const character = await requireOwner(parsed.data.characterId)

  const result = await updateCharacterName(
    character.id,
    parsed.data.name,
    parsed.data.expectedUpdatedAt
  )

  if (result.ok) {
    revalidatePath(`/c/${character.shortId}`)
  }

  return result
}
