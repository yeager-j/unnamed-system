import { z } from "zod/v4"

import { STAIN_ELEMENTS, STAIN_SLOT_COUNT } from "@workspace/game/engine"

import type { MechanicPersistenceError } from "@/lib/db/writes/mechanic-state"

import { characterMutationBase } from "../../character-mutation.schema"

/**
 * Input schemas for the Mage — Stains owner controls (UNN-229). Every mutation
 * is a per-slot write: `setStainSlot` addresses one slot by index and sets it
 * to an element (add / replace) or `null` (remove), so the client never builds
 * the full token array from possibly-stale optimistic state — the server reads
 * the row and sets the one slot. `clearStains` wipes all four.
 */
export const SetStainSlotSchema = characterMutationBase.extend({
  slotIndex: z
    .number()
    .int()
    .min(0)
    .max(STAIN_SLOT_COUNT - 1),
  element: z.enum(STAIN_ELEMENTS).nullable(),
})

export type SetStainSlotInput = z.input<typeof SetStainSlotSchema>

export type SetStainSlotError = "invalid-input" | MechanicPersistenceError

export const ClearStainsSchema = characterMutationBase

export type ClearStainsInput = z.input<typeof ClearStainsSchema>

export type ClearStainsError = "invalid-input" | MechanicPersistenceError
