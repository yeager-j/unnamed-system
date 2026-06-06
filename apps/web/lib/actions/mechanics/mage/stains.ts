"use server"

import { err, type Result } from "@workspace/game/foundation/result"
import { clearStains, setStainSlot } from "@workspace/game/mechanics"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  applyMechanicStateForCharacter,
  type MechanicWriteSuccess,
} from "@/lib/db/writes/mechanic-state"

import { revalidateCharacter } from "../../revalidate"
import {
  ClearStainsSchema,
  SetStainSlotSchema,
  type ClearStainsError,
  type ClearStainsInput,
  type SetStainSlotError,
  type SetStainSlotInput,
} from "./stains.schema"

/**
 * Server Actions for the Mage — Stains owner controls (UNN-229). Each one:
 * parse → `requireOwner` → compose the pure transition
 * ({@link setStainSlot} / {@link clearStains}) through the shared
 * {@link applyMechanicStateForCharacter} primitive → `revalidateCharacter` on
 * success. No per-mechanic DB wrapper: the shared primitive owns the entire
 * persistence transaction. See `lib/actions/README.md` ("Mechanic writes").
 */
export async function setStainSlotAction(
  input: SetStainSlotInput
): Promise<Result<MechanicWriteSuccess<"stains">, SetStainSlotError>> {
  const parsed = SetStainSlotSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "stains",
    (state) => setStainSlot(state, parsed.data.slotIndex, parsed.data.element),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}

export async function clearStainsAction(
  input: ClearStainsInput
): Promise<Result<MechanicWriteSuccess<"stains">, ClearStainsError>> {
  const parsed = ClearStainsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await applyMechanicStateForCharacter(
    character.id,
    "stains",
    (state) => clearStains(state),
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
