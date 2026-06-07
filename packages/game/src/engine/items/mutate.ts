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
import { type InventoryMutation } from "@workspace/game/foundation/items/schema"
import type { Result } from "@workspace/game/foundation/result"

/** Re-exported from `foundation/items/schema` (a logic-free command type) so
 *  existing deep imports of this module keep resolving. */
export type { InventoryMutation }

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
