"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  setOriginArchetype,
  type OriginArchetypePersistenceSuccess,
} from "@/lib/db/writes/origin-archetype"
import { err, type Result } from "@/lib/result"

import {
  SetOriginArchetypeSchema,
  type SetOriginArchetypeError,
  type SetOriginArchetypeInput,
} from "./origin-archetype.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Sets (or switches) the character's Origin Archetype during Step 2 of the
 * builder. Inserts a fresh `characterArchetype` row at Rank 2 (PRD §5.1) and
 * points `characters.activeArchetypeId` at it. See `lib/actions/README.md`
 * for the canonical write pattern this follows.
 */
export async function setOriginArchetypeAction(
  input: SetOriginArchetypeInput
): Promise<Result<OriginArchetypePersistenceSuccess, SetOriginArchetypeError>> {
  const parsed = SetOriginArchetypeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await setOriginArchetype(
    character.id,
    parsed.data.archetypeKey,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
