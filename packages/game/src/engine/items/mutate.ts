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
import { type GameData } from "@workspace/game/engine/ports"
import { type InventoryMutation } from "@workspace/game/foundation/items/schema"
import type { Result } from "@workspace/game/foundation/result"

/** Every recoverable failure the underlying engines can surface. */
export type InventoryMutationError = EquipError | AddError | QuantityError

/**
 * Routes an {@link InventoryMutation} to its pure engine transition over the
 * minimal {@link InventoryItemState} projection. `newId` mints ids for rows the
 * `add` transition creates — the caller (ultimately the composition root) passes
 * the generator; the engine core keeps no default seam.
 */
export function applyInventoryMutation(
  items: readonly InventoryItemState[],
  mutation: InventoryMutation,
  lookups: Pick<GameData, "getItem" | "getEquippableItem">,
  newId: () => string
): Result<InventoryItemState[], InventoryMutationError> {
  switch (mutation.kind) {
    case "equip":
      return equipItem(lookups)(items, mutation.itemId)
    case "unequip":
      return unequipItem(items, mutation.itemId)
    case "add":
      return addItem(lookups)(
        items,
        mutation.catalogItemKey,
        mutation.quantity,
        newId
      )
    case "setQuantity":
      return setItemQuantity(lookups)(items, mutation.itemId, mutation.quantity)
    case "remove":
      return removeItem(items, mutation.itemId)
  }
}
