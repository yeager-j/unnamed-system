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
import {
  reduceCharacter,
  type CharacterEdit,
  type HydratedCharacter,
} from "@/lib/game/character"
import type { InventoryMutation } from "@/lib/game/items"

/**
 * Owns the Inventory tab's owner-mode write lifecycle so the component stays
 * presentational. A single character-level optimistic frame runs the pure
 * {@link reduceCharacter} — the same derivation the server uses — so item and
 * currency edits re-derive every dependent value, not just the slice they
 * touch. Both share the `inventory` write class (UNN-140), so one `versionRef`
 * keeps the frame coherent; on failure the optimistic state reverts and a toast
 * explains.
 */
export function useInventoryEditor(character: HydratedCharacter) {
  const [pending, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(character.inventoryVersion)

  const [optimisticCharacter, applyEdit] = useOptimistic(
    character,
    (current, edit: CharacterEdit) => reduceCharacter(current, edit)
  )

  function dispatchMutation(mutation: InventoryMutation) {
    startTransition(async () => {
      applyEdit({ kind: "inventory", mutation })
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
      applyEdit({ kind: "currency", delta })
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

  return {
    character: optimisticCharacter,
    pending,
    dispatchMutation,
    dispatchCurrency,
  }
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
