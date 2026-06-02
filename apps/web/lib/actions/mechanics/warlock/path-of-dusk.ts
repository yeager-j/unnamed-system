"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/writes/mechanic-state"
import { setDuskMode } from "@/lib/game/mechanics"
import { err, type Result } from "@/lib/result"

import { revalidateCharacter } from "../../revalidate"
import {
  SetDuskModeSchema,
  type SetDuskModeError,
  type SetDuskModeInput,
} from "./path-of-dusk.schema"

/**
 * Server Action for the Healer — Path of Dusk Dusk Mode toggle (UNN-230).
 * Parse → `requireOwner` → compose the pure {@link setDuskMode} transition
 * through the shared {@link applyMechanicStateForCharacter} primitive →
 * `revalidateCharacter` on success. No per-mechanic DB wrapper: the shared
 * primitive owns the entire persistence transaction. See
 * `lib/actions/README.md` ("Mechanic writes").
 */
export async function setDuskModeAction(
  input: SetDuskModeInput
): Promise<Result<MechanicWriteSuccess<"path-of-dusk">, SetDuskModeError>> {
  const parsed = SetDuskModeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "path-of-dusk",
    (state) => setDuskMode(state, parsed.data.duskMode),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
