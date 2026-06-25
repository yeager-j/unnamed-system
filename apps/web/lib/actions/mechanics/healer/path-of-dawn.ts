"use server"

import { setDawnMode } from "@workspace/game/engine"
import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/writes/mechanic-state"

import { revalidateCharacter } from "../../revalidate"
import {
  SetDawnModeSchema,
  type SetDawnModeError,
  type SetDawnModeInput,
} from "./path-of-dawn.schema"

/**
 * Server Action for the Healer — Path of Dawn Dawn Mode toggle (UNN-230).
 * Parse → `requireOwner` → compose the pure {@link setDawnMode} transition
 * through the shared {@link applyMechanicStateForCharacter} primitive →
 * `revalidateCharacter` on success. No per-mechanic DB wrapper: the shared
 * primitive owns the entire persistence transaction. See
 * `lib/actions/CLAUDE.md` ("Mechanic writes").
 */
export async function setDawnModeAction(
  input: SetDawnModeInput
): Promise<Result<MechanicWriteSuccess<"path-of-dawn">, SetDawnModeError>> {
  const parsed = SetDawnModeSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "path-of-dawn",
    (state) => setDawnMode(state, parsed.data.dawnMode),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
