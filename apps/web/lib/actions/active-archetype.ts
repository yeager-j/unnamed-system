"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  setActiveArchetype,
  type ActiveArchetypePersistenceSuccess,
} from "@/lib/db/writes/active-archetype"
import { err, type Result } from "@/lib/result"

import {
  SetActiveArchetypeSchema,
  type SetActiveArchetypeError,
  type SetActiveArchetypeInput,
} from "./active-archetype.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Action for switching the active Archetype (PRD §6.1, UNN-238). Parses
 * the input, `requireOwner` (non-owners get HTTP 403), re-points
 * `activeArchetypeId` via the guarded write, then {@link revalidateCharacter}
 * so the sheet's derived Attributes / Affinities / Skills / Mechanic widget
 * re-render with the newly-active Archetype.
 */
export async function setActiveArchetypeAction(
  input: SetActiveArchetypeInput
): Promise<Result<ActiveArchetypePersistenceSuccess, SetActiveArchetypeError>> {
  const parsed = SetActiveArchetypeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await setActiveArchetype(
    character.id,
    parsed.data.characterArchetypeId,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
