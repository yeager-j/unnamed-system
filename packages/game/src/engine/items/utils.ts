import type { HydratedInventoryItem } from "@workspace/game/character"
import { getEquippableItem, getItem } from "@workspace/game/data/items/registry"
import {
  isConsumable,
  isEquippable,
  type EquippableItem,
  type EquippedWeapon,
  type EquipSlot,
  type Item,
  type ItemForSlot,
} from "@workspace/game/foundation/items/schema"
import { err, ok, type Result } from "@workspace/game/foundation/result"

/**
 * The minimum inventory slice the engine reads and rewrites — a
 * persistence-agnostic projection of one `inventoryItem` row. The pure layer
 * keeps no other fields, so it can be reused by a future engine that takes a
 * different transport than Drizzle rows.
 */
export interface InventoryItemState {
  id: string
  catalogItemKey: string
  equipped: boolean
  quantity: number
}

/**
 * Recoverable failures: the inventory has no item with that id, or the
 * targeted row's `catalogItemKey` no longer resolves to a shipped catalog
 * entry (so we cannot determine its slot to enforce one-per-slot).
 */
export type EquipError = "item-not-found" | "catalog-item-unknown"

/**
 * Equips the inventory item with `itemId` and unequips any other item already
 * equipped in the same slot — a single click swaps. Returns a fresh array; the
 * input is never mutated. The slot is read from the hardcoded catalog via
 * {@link getEquippableItem}.
 */
export function equipItem(
  items: readonly InventoryItemState[],
  itemId: string
): Result<InventoryItemState[], EquipError> {
  const target = items.find((item) => item.id === itemId)
  if (!target) return err("item-not-found")

  const targetCatalogItem = getEquippableItem(target.catalogItemKey)
  if (!targetCatalogItem) return err("catalog-item-unknown")

  const targetSlot = targetCatalogItem.equip.slot

  const next = items.map((item) => {
    if (item.id === itemId) return { ...item, equipped: true }
    const itsSlot = getEquippableItem(item.catalogItemKey)?.equip.slot
    return itsSlot === targetSlot ? { ...item, equipped: false } : item
  })

  return ok(next)
}

/**
 * Unequips the inventory item with `itemId`. Idempotent: if the item is
 * already unequipped, returns an unchanged copy. Returns `item-not-found` when
 * no row matches.
 */
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
 * Adds `requestedQuantity` units of `catalogItemKey` to the inventory. For a
 * stackable item (`stackSize > 1`) the quantity tops up existing rows of the
 * same item up to `stackSize` and overflows into new rows; for a non-stackable
 * item it always creates that many separate rows. New rows are unequipped and
 * get their id from `newId` (the server's `crypto.randomUUID`, or a client
 * temp id for the optimistic frame). Returns a fresh array; never mutates.
 */
export function addItem(
  items: readonly InventoryItemState[],
  catalogItemKey: string,
  requestedQuantity: number,
  newId: () => string
): Result<InventoryItemState[], AddError> {
  const item = getItem(catalogItemKey)
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

/** Recoverable failure: no inventory row matches the given id. */
export type QuantityError = "item-not-found"

/**
 * Sets the quantity of the row `itemId`, clamped to `[0, stackSize]`. A clamped
 * value of 0 drops the row entirely — no phantom zero-quantity rows. Returns a
 * fresh array; never mutates.
 */
export function setItemQuantity(
  items: readonly InventoryItemState[],
  itemId: string,
  quantity: number
): Result<InventoryItemState[], QuantityError> {
  const target = items.find((item) => item.id === itemId)
  if (!target) return err("item-not-found")

  const stackSize = getItem(target.catalogItemKey)?.stackSize ?? 1
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

/**
 * Removes the row `itemId` outright. A currently-equipped row is removed too —
 * deleting it structurally unequips the item, and the caller re-derives the
 * dependent stats. Returns a fresh array; never mutates.
 */
export function removeItem(
  items: readonly InventoryItemState[],
  itemId: string
): Result<InventoryItemState[], QuantityError> {
  if (!items.some((item) => item.id === itemId)) return err("item-not-found")
  return ok(items.filter((item) => item.id !== itemId))
}

/** One resolved equippable row: the catalog entry plus its row id, equip
 *  state, and stacked quantity. */
export interface ResolvedInventoryEntry<S extends EquipSlot = EquipSlot> {
  id: string
  item: ItemForSlot<S>
  equipped: boolean
  quantity: number
}

/** One resolved non-equippable row (consumables and the like). */
export interface ResolvedConsumableEntry {
  id: string
  item: Item
  quantity: number
}

interface ItemsBySlot {
  weapon: ResolvedInventoryEntry<"weapon">[]
  armor: ResolvedInventoryEntry<"armor">[]
  accessory: ResolvedInventoryEntry<"accessory">[]
}

export interface ResolvedInventory {
  equippedWeapon: EquippedWeapon | null
  equippedArmor: ItemForSlot<"armor"> | null
  equippedAccessory: ItemForSlot<"accessory"> | null
  itemsBySlot: ItemsBySlot
  consumables: ResolvedConsumableEntry[]
}

interface EquippableEntry {
  id: string
  item: EquippableItem
  equipped: boolean
  quantity: number
}

/**
 * Shapes the hydrated inventory rows the {@link Inventory} tab needs: the three
 * equipped slots (typed to their concrete slot), every equippable item grouped
 * by slot, and the consumables, each carrying its row id and quantity so the
 * tab can key and mutate by row. Sorted alphabetically. Rows whose
 * `catalogItemKey` no longer resolves to a shipped catalog entry — or resolve
 * to a non-equippable, non-consumable item — are dropped; they cannot be
 * rendered without a group.
 */
export function resolveInventory(
  inventory: HydratedInventoryItem[]
): ResolvedInventory {
  const equippable: EquippableEntry[] = []
  const consumables: ResolvedConsumableEntry[] = []

  for (const entry of inventory) {
    const { item } = entry
    if (!item) continue
    if (isEquippable(item)) {
      equippable.push({
        id: entry.id,
        item,
        equipped: entry.equipped,
        quantity: entry.quantity,
      })
    } else if (isConsumable(item)) {
      consumables.push({ id: entry.id, item, quantity: entry.quantity })
    }
  }

  const itemsBySlot: ItemsBySlot = {
    weapon: filterAndSort(equippable, "weapon"),
    armor: filterAndSort(equippable, "armor"),
    accessory: filterAndSort(equippable, "accessory"),
  }

  return {
    equippedWeapon: itemsBySlot.weapon.find((e) => e.equipped)?.item ?? null,
    equippedArmor: itemsBySlot.armor.find((e) => e.equipped)?.item ?? null,
    equippedAccessory:
      itemsBySlot.accessory.find((e) => e.equipped)?.item ?? null,
    itemsBySlot,
    consumables: consumables.sort((a, b) =>
      a.item.name.localeCompare(b.item.name)
    ),
  }
}

function filterAndSort<S extends EquipSlot>(
  entries: EquippableEntry[],
  slot: S
): ResolvedInventoryEntry<S>[] {
  return entries
    .filter(
      (entry): entry is ResolvedInventoryEntry<S> =>
        entry.item.equip.slot === slot
    )
    .sort((a, b) => a.item.name.localeCompare(b.item.name))
}
