"use client"

import { useCharacterWrite } from "@/hooks/use-character"
import {
  clearStainsAction,
  setStainSlotAction,
} from "@/lib/actions/mechanics/mage/stains"
import { type StainElement } from "@/lib/game/mechanics"

/**
 * Owner-mode write handlers for the Mage's Stains (UNN-229). `setSlot`
 * addresses one slot by index — fill an empty one, replace a full one, or pass
 * `null` to consume — and `clear` empties all four. Each dispatches a `stains`
 * {@link CharacterEdit} through the shared {@link useCharacterWrite} path, so
 * the optimistic tokens (re-derived on the active Archetype's mechanic state)
 * move in the same frame as the server write. The slot index is the per-field
 * key, so back-to-back clicks merge server-side instead of clobbering.
 */
export function useStainsControls(): {
  setSlot: (slotIndex: number, element: StainElement | null) => void
  clear: () => void
  pending: boolean
} {
  const { pending, write, characterId } = useCharacterWrite()

  function setSlot(slotIndex: number, element: StainElement | null) {
    write({
      edit: { kind: "stains", op: "setSlot", slotIndex, element },
      characterClass: "vitals",
      action: (expectedVersion) =>
        setStainSlotAction({
          characterId,
          slotIndex,
          element,
          expectedVersion,
        }),
    })
  }

  function clear() {
    write({
      edit: { kind: "stains", op: "clear" },
      characterClass: "vitals",
      action: (expectedVersion) =>
        clearStainsAction({ characterId, expectedVersion }),
    })
  }

  return { setSlot, clear, pending }
}
