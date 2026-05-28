"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  addInventoryItemAction,
  adjustCurrencyAction,
  equipInventoryItemAction,
  removeInventoryItemAction,
  setInventoryItemQuantityAction,
  unequipInventoryItemAction,
} from "@/lib/actions/inventory"
import { MAX_CURRENCY, type HydratedCharacter } from "@/lib/game/character"
import {
  reduceHydratedInventory,
  type InventoryMutation,
} from "@/lib/game/items"

/**
 * Owns the Inventory tab's owner-mode write lifecycle so the component stays
 * presentational. Inventory edits and currency edits share the `inventory`
 * write class (UNN-140), so a single `versionRef` keeps the tab's optimistic
 * frame coherent across both. Each edit applies the same pure engine the server
 * runs for the optimistic projection, then persists via the Server Action; on
 * failure the optimistic state reverts and a toast explains.
 */
export function useInventoryEditor(character: HydratedCharacter) {
  const [pending, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(character.inventoryVersion)

  const [inventory, applyInventory] = useOptimistic(
    character.inventory,
    (current, mutation: InventoryMutation) =>
      reduceHydratedInventory(current, mutation, character.id)
  )

  const [currency, applyCurrency] = useOptimistic(
    character.currency,
    (current, delta: number) =>
      Math.max(0, Math.min(MAX_CURRENCY, current + delta))
  )

  function dispatchMutation(mutation: InventoryMutation) {
    startTransition(async () => {
      applyInventory(mutation)
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "inventory",
        versionRef,
        action: (expectedVersion) =>
          runInventoryAction(character.id, mutation, expectedVersion),
      })

      if (result.ok) return
      toast.error(
        result.error === "stale"
          ? "Couldn't sync inventory — refresh to see the latest."
          : "Couldn't update inventory. Try again."
      )
    })
  }

  function dispatchCurrency(delta: number) {
    if (delta === 0) return
    startTransition(async () => {
      applyCurrency(delta)
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "inventory",
        versionRef,
        action: (expectedVersion) =>
          adjustCurrencyAction({
            characterId: character.id,
            delta,
            expectedVersion,
          }),
      })

      if (result.ok) return
      toast.error(
        result.error === "stale"
          ? "Couldn't sync currency — refresh to see the latest."
          : "Couldn't update currency. Try again."
      )
    })
  }

  return { inventory, currency, pending, dispatchMutation, dispatchCurrency }
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
