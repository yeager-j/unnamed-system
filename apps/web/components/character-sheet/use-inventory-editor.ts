"use client"

import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import {
  addInventoryItemAction,
  adjustCurrencyAction,
  equipInventoryItemAction,
  removeInventoryItemAction,
  setInventoryItemQuantityAction,
  unequipInventoryItemAction,
} from "@/lib/actions/inventory"
import type { InventoryMutation } from "@/lib/game/items"

/**
 * The Inventory tab's owner-mode write surface. Reads the shared optimistic
 * character and dispatches inventory/currency edits through the one
 * {@link useCharacterWrite} path (UNN-237). Both share the `inventory` write
 * class (UNN-140); item and currency edits re-derive every dependent value via
 * {@link reduceCharacter}.
 */
export function useInventoryEditor() {
  const character = useCharacter()
  const { pending, write } = useCharacterWrite()

  function dispatchMutation(mutation: InventoryMutation) {
    write({
      edit: { kind: "inventory", mutation },
      characterClass: "inventory",
      action: (expectedVersion) =>
        runInventoryAction(character.id, mutation, expectedVersion),
      messages: {
        stale: "Couldn't sync inventory — refresh to see the latest.",
        error: "Couldn't update inventory. Try again.",
      },
    })
  }

  function dispatchCurrency(delta: number) {
    if (delta === 0) return
    write({
      edit: { kind: "currency", delta },
      characterClass: "inventory",
      action: (expectedVersion) =>
        adjustCurrencyAction({
          characterId: character.id,
          delta,
          expectedVersion,
        }),
      messages: {
        stale: "Couldn't sync currency — refresh to see the latest.",
        error: "Couldn't update currency. Try again.",
      },
    })
  }

  return { character, pending, dispatchMutation, dispatchCurrency }
}

/** Routes an {@link InventoryMutation} to its Server Action. */
function runInventoryAction(
  characterId: string,
  mutation: InventoryMutation,
  expectedVersion: number
) {
  switch (mutation.kind) {
    case "equip":
      return equipInventoryItemAction({
        characterId,
        itemId: mutation.itemId,
        expectedVersion,
      })
    case "unequip":
      return unequipInventoryItemAction({
        characterId,
        itemId: mutation.itemId,
        expectedVersion,
      })
    case "add":
      return addInventoryItemAction({
        characterId,
        catalogItemKey: mutation.catalogItemKey,
        quantity: mutation.quantity,
        expectedVersion,
      })
    case "setQuantity":
      return setInventoryItemQuantityAction({
        characterId,
        itemId: mutation.itemId,
        quantity: mutation.quantity,
        expectedVersion,
      })
    case "remove":
      return removeInventoryItemAction({
        characterId,
        itemId: mutation.itemId,
        expectedVersion,
      })
  }
}
