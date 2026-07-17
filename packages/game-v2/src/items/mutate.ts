import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { InventoryMutation } from "@workspace/game-v2/items/item.schema"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { err, ok, type Result } from "@workspace/result"

/**
 * The pure item-mutation engine, ported as-is from v1 `engine/items/utils.ts` +
 * `mutate.ts`. Every transition returns a fresh {@link InventoryItemState}[] and
 * never mutates its input. Catalog lookups (slot, `stackSize`) are injected via a
 * `Pick<GameData, …>` slice; `newId` mints ids for the rows `add` creates.
 */

/**
 * Recoverable equip failures: no row has that id, or the targeted row's
 * `catalogItemKey` no longer resolves to a shipped equippable entry (so we can't
 * determine its slot to enforce one-per-slot).
 */
export type EquipError = "item-not-found" | "catalog-item-unknown"

/**
 * Equips `itemId` and unequips any other item already equipped in the same slot —
 * a single click swaps. An orphaned equipped row (unshipped key, slot `undefined`)
 * is never a same-slot conflict (`undefined !== targetSlot`).
 */
export function equipItem(lookups: Pick<GameData, "getEquippableItem">) {
  return (
    items: readonly InventoryItemState[],
    itemId: string
  ): Result<InventoryItemState[], EquipError> => {
    const target = items.find((item) => item.id === itemId)
    if (!target) return err("item-not-found")

    const targetCatalogItem = lookups.getEquippableItem(target.catalogItemKey)
    if (!targetCatalogItem) return err("catalog-item-unknown")

    const targetSlot = targetCatalogItem.equip.slot

    const next = items.map((item) => {
      if (item.id === itemId) return { ...item, equipped: true }
      const itsSlot = lookups.getEquippableItem(item.catalogItemKey)?.equip.slot
      return itsSlot === targetSlot ? { ...item, equipped: false } : item
    })

    return ok(next)
  }
}

/** Unequips `itemId`. Idempotent (an already-unequipped row returns an unchanged
 *  copy); `item-not-found` on a miss. */
export function unequipItem(
  items: readonly InventoryItemState[],
  itemId: string
): Result<InventoryItemState[], EquipError> {
  const target = items.find((item) => item.id === itemId)
  if (!target) return err("item-not-found")

  const next = items.map((item) =>
    item.id === itemId ? { ...item, equipped: false } : item
  )

  return ok(next)
}

/** Recoverable failures when adding an item from the catalog. */
export type AddError = "catalog-item-unknown" | "invalid-quantity"

/**
 * Adds `requestedQuantity` units of `catalogItemKey`. **Top-up-then-overflow**: for
 * a stackable item (`stackSize > 1`) first tops up existing rows of the same item
 * up to `stackSize`, then overflows the rest into new rows each capped at
 * `stackSize`; for a non-stackable item the top-up loop is a no-op, so it always
 * creates that many separate single-unit rows. New rows are unequipped and get
 * their id from `newId`.
 */
export function addItem(lookups: Pick<GameData, "getItem">) {
  return (
    items: readonly InventoryItemState[],
    catalogItemKey: string,
    requestedQuantity: number,
    newId: () => string
  ): Result<InventoryItemState[], AddError> => {
    const item = lookups.getItem(catalogItemKey)
    if (!item) return err("catalog-item-unknown")
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return err("invalid-quantity")
    }

    const { stackSize } = item
    const next = items.map((row) => ({ ...row }))
    let remaining = requestedQuantity

    if (stackSize > 1) {
      for (const row of next) {
        if (remaining <= 0) break
        if (row.catalogItemKey !== catalogItemKey) continue
        const capacity = stackSize - row.quantity
        if (capacity <= 0) continue
        const added = Math.min(capacity, remaining)
        row.quantity += added
        remaining -= added
      }
    }

    while (remaining > 0) {
      const added = Math.min(stackSize, remaining)
      next.push({
        id: newId(),
        catalogItemKey,
        equipped: false,
        quantity: added,
      })
      remaining -= added
    }

    return ok(next)
  }
}

/** Recoverable failure: no inventory row matches the given id. */
export type QuantityError = "item-not-found"

/**
 * Sets the quantity of `itemId`, clamped to `[0, stackSize]` with a floor. A
 * clamped value of 0 **drops the row** (no phantom zero-quantity rows); `stackSize`
 * defaults to 1 when the catalog key is unshipped. `item-not-found` on a miss.
 */
export function setItemQuantity(lookups: Pick<GameData, "getItem">) {
  return (
    items: readonly InventoryItemState[],
    itemId: string,
    quantity: number
  ): Result<InventoryItemState[], QuantityError> => {
    const target = items.find((item) => item.id === itemId)
    if (!target) return err("item-not-found")

    const stackSize = lookups.getItem(target.catalogItemKey)?.stackSize ?? 1
    const clamped = Math.max(0, Math.min(stackSize, Math.floor(quantity)))

    if (clamped === 0) {
      return ok(items.filter((item) => item.id !== itemId))
    }

    return ok(
      items.map((item) =>
        item.id === itemId ? { ...item, quantity: clamped } : item
      )
    )
  }
}

/**
 * Removes `itemId` outright — even when equipped (structurally unequipping it; the
 * caller re-derives dependent stats). `item-not-found` when no row matches.
 */
export function removeItem(
  items: readonly InventoryItemState[],
  itemId: string
): Result<InventoryItemState[], QuantityError> {
  if (!items.some((item) => item.id === itemId)) return err("item-not-found")
  return ok(items.filter((item) => item.id !== itemId))
}

/** Every recoverable failure the underlying transitions can surface. */
export type InventoryMutationError = EquipError | AddError | QuantityError

/**
 * Routes an {@link InventoryMutation} to its pure transition over the
 * {@link InventoryItemState} list. `newId` mints ids for `add`-created rows — the
 * caller (ultimately the composition root) passes the generator; the engine core
 * keeps no default seam. Exhaustive over the closed `kind` union.
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
