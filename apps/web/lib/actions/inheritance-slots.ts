"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  setInheritanceSlot,
  type InheritanceSlotPersistenceSuccess,
} from "@/lib/db/writes/inheritance-slots"

import {
  SetInheritanceSlotSchema,
  type SetInheritanceSlotError,
  type SetInheritanceSlotInput,
} from "./inheritance-slots.schema"
import { revalidateCharacter } from "./revalidate"

/**
 * Server Action for configuring one Inheritance Slot (PRD §7.8, UNN-241).
 * Parses the input, `requireOwner` (non-owners get HTTP 403), merges the slot
 * into the owning Archetype's `inheritanceSlots` via the guarded write, then
 * {@link revalidateCharacter} so the Combat-tab Skills list re-derives when the
 * edited Archetype is active.
 */
export async function setInheritanceSlotAction(
  input: SetInheritanceSlotInput
): Promise<Result<InheritanceSlotPersistenceSuccess, SetInheritanceSlotError>> {
  const parsed = SetInheritanceSlotSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const result = await setInheritanceSlot(
    character.id,
    {
      characterArchetypeId: parsed.data.characterArchetypeId,
      slotIndex: parsed.data.slotIndex,
      sourceCharacterArchetypeId: parsed.data.sourceCharacterArchetypeId,
      skillKey: parsed.data.skillKey,
    },
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateCharacter(character)

  return result
}
