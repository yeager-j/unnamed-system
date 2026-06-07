import {
  addItem,
  equipItem,
  removeItem,
  setItemQuantity,
  unequipItem,
  type AddError,
  type EquipError,
  type InventoryItemState,
  type QuantityError,
} from "@workspace/game/engine/items/utils"
import { type ItemLookup } from "@workspace/game/engine/ports"
import type { Result } from "@workspace/game/foundation/result"

/**
 * The vocabulary of owner-mode inventory edits, shared by the optimistic
 * reducer here and the Server Action dispatcher in the UI. Each variant maps to
 * one pure engine transition.
 */
export type InventoryMutation =
  | { kind: "equip"; itemId: string }
  | { kind: "unequip"; itemId: string }
  | { kind: "add"; catalogItemKey: string; quantity: number }
  | { kind: "setQuantity"; itemId: string; quantity: number }
  | { kind: "remove"; itemId: string }

/** Every recoverable failure the underlying engines can surface. */
export type InventoryMutationError = EquipError | AddError | QuantityError

const randomId = () => crypto.randomUUID()

/**
 * Routes an {@link InventoryMutation} to its pure engine transition over the
 * minimal {@link InventoryItemState} projection. `newId` mints ids for rows the
 * `add` transition creates — the server passes its own generator; the
 * optimistic frame defaults to `crypto.randomUUID`.
 */
export function applyInventoryMutation(
  items: readonly InventoryItemState[],
  mutation: InventoryMutation,
  lookups: ItemLookup,
  newId: () => string = randomId
): Result<InventoryItemState[], InventoryMutationError> {
  switch (mutation.kind) {
    case "equip":
      return equipItem(items, mutation.itemId, lookups)
    case "unequip":
      return unequipItem(items, mutation.itemId)
    case "add":
      return addItem(
        items,
        mutation.catalogItemKey,
        mutation.quantity,
        newId,
        lookups
      )
    case "setQuantity":
      return setItemQuantity(items, mutation.itemId, mutation.quantity, lookups)
    case "remove":
      return removeItem(items, mutation.itemId)
  }
}
