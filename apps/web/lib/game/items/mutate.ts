import type { Result } from "../../result"
import type { HydratedInventoryItem } from "../character"
import { getItem } from "./registry"
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
} from "./utils"

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
  newId: () => string = randomId
): Result<InventoryItemState[], InventoryMutationError> {
  switch (mutation.kind) {
    case "equip":
      return equipItem(items, mutation.itemId)
    case "unequip":
      return unequipItem(items, mutation.itemId)
    case "add":
      return addItem(items, mutation.catalogItemKey, mutation.quantity, newId)
    case "setQuantity":
      return setItemQuantity(items, mutation.itemId, mutation.quantity)
    case "remove":
      return removeItem(items, mutation.itemId)
  }
}

/**
 * Applies an {@link InventoryMutation} to the hydrated rows for an optimistic
 * frame: projects to {@link InventoryItemState}, runs the same pure engine the
 * server runs, then rebuilds the hydrated array from the result (add/remove
 * change cardinality). Surviving rows keep their hydrated catalog entry; rows
 * the `add` transition creates get a temp id and their resolved entry, which
 * the server's revalidate later replaces with the persisted row. On engine
 * failure the input is returned unchanged.
 */
export function reduceHydratedInventory(
  current: HydratedInventoryItem[],
  mutation: InventoryMutation,
  characterId: string,
  newId: () => string = randomId
): HydratedInventoryItem[] {
  const projection: InventoryItemState[] = current.map((entry) => ({
    id: entry.id,
    catalogItemKey: entry.catalogItemKey,
    equipped: entry.equipped,
    quantity: entry.quantity,
  }))

  const result = applyInventoryMutation(projection, mutation, newId)
  if (!result.ok) return current

  const byId = new Map(current.map((entry) => [entry.id, entry]))
  return result.value.map((state) => {
    const existing = byId.get(state.id)
    if (existing) {
      return { ...existing, equipped: state.equipped, quantity: state.quantity }
    }
    return {
      id: state.id,
      characterId,
      catalogItemKey: state.catalogItemKey,
      equipped: state.equipped,
      quantity: state.quantity,
      item: getItem(state.catalogItemKey),
    }
  })
}
