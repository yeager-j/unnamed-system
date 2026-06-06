"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  setCharacterVirtues,
  type CharacterVirtuesPersistenceSuccess,
} from "@/lib/db/writes/virtues"

import {
  SetVirtuesSchema,
  type SetVirtuesError,
  type SetVirtuesInput,
} from "./character-virtues.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Persists the Step-3 Virtue allocation. The Zod schema enforces the
 * rulebook 1.2 creation constraint (one +2, two +1s, one 0) before the
 * database round-trip, so a tampered or out-of-spec payload returns
 * `invalid-input` without touching the row. Builder UI also enforces this
 * up front, but the server check is the canonical gate.
 */
export async function setCharacterVirtuesAction(
  input: SetVirtuesInput
): Promise<Result<CharacterVirtuesPersistenceSuccess, SetVirtuesError>> {
  const parsed = SetVirtuesSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await setCharacterVirtues(
    character.id,
    {
      expression: parsed.data.expression,
      empathy: parsed.data.empathy,
      wisdom: parsed.data.wisdom,
      focus: parsed.data.focus,
    },
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
