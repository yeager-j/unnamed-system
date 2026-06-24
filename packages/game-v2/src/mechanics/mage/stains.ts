import { z } from "zod/v4"

import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"

/**
 * Mage — Stains. Elemental Skills cast on the Mage's turn leave residue that
 * empowers later Skills (rulebook `Stains.md`). The Mage holds up to four Stains;
 * some Skills consume matching Stains when cast. Display-only in MVP (Skill-cast
 * generation/consumption is tracked at the table); this module owns the state +
 * behavior. The element set is the rulebook's elemental Skill coverage.
 */
export const STAIN_ELEMENTS = ["fire", "ice", "elec", "wind", "light"] as const
export type StainElement = (typeof STAIN_ELEMENTS)[number]

export const STAIN_SLOT_COUNT = 4

export const stainsStateSchema = z.object({
  kind: z.literal("stains"),
  tokens: z.array(z.enum(STAIN_ELEMENTS).nullable()).length(STAIN_SLOT_COUNT),
})
export type StainsState = z.infer<typeof stainsStateSchema>

/**
 * Sets a single slot to an element (add / replace) or to `null` (remove /
 * consume); an out-of-range index is a no-op. Slot position is mechanically
 * meaningless, so the caller decides which slot to write and the server just sets
 * it — the per-field write that keeps back-to-back clicks from clobbering each
 * other. Pure.
 */
export function setStainSlot(
  state: StainsState,
  slotIndex: number,
  element: StainElement | null
): StainsState {
  if (slotIndex < 0 || slotIndex >= STAIN_SLOT_COUNT) return state
  const tokens = state.tokens.slice()
  tokens[slotIndex] = element
  return { ...state, tokens }
}

/** Pure transition that empties every slot (e.g. end of combat). */
export function clearStains(state: StainsState): StainsState {
  return {
    ...state,
    tokens: Array.from({ length: STAIN_SLOT_COUNT }, () => null),
  }
}

export const stains: MechanicDefinition<StainsState> = {
  kind: "stains",
  displayName: "Stains",
  tagline:
    "Elemental Skills leave Stains behind that later Skills consume for bonus effects.",
  description: `The elemental Skills you cast on your turn leave behind residue that empowers the Skills you cast in the future.

***Generating Stains.*** Some Skills generate Stains when cast. You gain these Stains whether or not the attack hits or does damage. You can have up to 4 Stains at any one time. If you would exceed this limit, choose one or more of your Stains to replace.

***Consuming Stains.*** Some Skills consume Stains to produce additional effects. You do not choose whether or not to consume Stains; if the Stain(s) is available, it is consumed.`,
  schema: stainsStateSchema,
  initialState: () => ({
    kind: "stains",
    tokens: Array.from({ length: STAIN_SLOT_COUNT }, () => null),
  }),
  resetOn: "encounter",
}
