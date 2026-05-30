import { z } from "zod/v4"

import type { InheritanceSlotPersistenceError } from "@/lib/db/writes/inheritance-slots"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schema for the owner-mode "Configure Inheritance Slot" action
 * (PRD §7.8, UNN-241). Targets one slot on one Archetype: the client sends the
 * owning `characterArchetype` row, the `slotIndex`, and either a
 * `(sourceCharacterArchetypeId, skillKey)` pair to fill it or both `null` to
 * clear it — the server reads the row and merges by `slotIndex` (the per-field
 * write pattern). Rides the `identityVersion` class, like the active-Archetype
 * pointer it sits beside.
 *
 * The `.refine` enforces the fill/clear pairing: a slot is either fully
 * configured (both non-null) or empty (both null); a half-set slot is a
 * programmer error, not a representable state.
 */
export const SetInheritanceSlotSchema = characterMutationBase
  .extend({
    characterArchetypeId: z.string().min(1),
    slotIndex: z.number().int().nonnegative(),
    sourceCharacterArchetypeId: z.string().min(1).nullable(),
    skillKey: z.string().min(1).nullable(),
  })
  .refine(
    (data) =>
      (data.sourceCharacterArchetypeId === null) === (data.skillKey === null),
    { message: "source and skill must both be set or both be cleared" }
  )

export type SetInheritanceSlotInput = z.input<typeof SetInheritanceSlotSchema>

export type SetInheritanceSlotError =
  | "invalid-input"
  | InheritanceSlotPersistenceError
