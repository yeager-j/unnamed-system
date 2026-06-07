import type { MechanicDefinition } from "@workspace/game/engine/mechanics/types"
import {
  STAIN_SLOT_COUNT,
  stainsStateSchema,
  type StainElement,
  type StainsState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Mage — Stains. Elemental Skills cast on the Mage's turn leave residue that
 * empowers later Skills (rulebook `Skills/Mechanics/Stains.md`). The Mage may
 * hold up to four Stains at once; some Skills consume matching Stains
 * automatically when cast. The persisted shape, the element set, and the slot
 * count live in `foundation/mechanics/schema`; this module owns the behaviour.
 */

/**
 * Pure transition the owner-mode controls compose through the persistence
 * layer. Sets a single slot to an element (add / replace) or to `null`
 * (remove / consume); an out-of-range index is a no-op. Slot position is
 * mechanically meaningless, so the caller decides which slot to write (an
 * empty one to add, an occupied one to replace) and the server just sets it —
 * the per-field write that keeps back-to-back clicks from clobbering each
 * other. Lives next to the definition so game logic stays out of the UI and
 * the DB wrapper, mirroring the Knight's `adjustValor`.
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
