import { err, ok, type Result } from "../../result"
import type { HydratedInventoryItem } from "../character/stats/hydrated-character"
import { getEquippableItem } from "./index"
import type { Accessory, Armor, EquippableItem, Weapon } from "./schema"

/**
 * The minimum inventory slice the equip resolution reads and rewrites — a
 * persistence-agnostic projection of one `inventoryItem` row. The pure layer
 * keeps no other fields, so it can be reused by a future engine that takes a
 * different transport than Drizzle rows.
 */
export interface InventoryItemState {
  id: string
  catalogItemKey: string
  equipped: boolean
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

  const targetSlot = targetCatalogItem.slot

  const next = items.map((item) => {
    if (item.id === itemId) return { ...item, equipped: true }
    if (!item.equipped) return item
    const itsSlot = getEquippableItem(item.catalogItemKey)?.slot
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

interface ResolvedInventoryEntry {
  item: EquippableItem
  equipped: boolean
}

interface ItemsBySlot {
  weapon: ResolvedInventoryEntry[]
  armor: ResolvedInventoryEntry[]
  accessory: ResolvedInventoryEntry[]
}

export interface ResolvedInventory {
  equippedWeapon: Weapon | null
  equippedArmor: Armor | null
  equippedAccessory: Accessory | null
  itemsBySlot: ItemsBySlot
}

/**
 * Shapes the hydrated inventory rows the {@link Inventory} tab needs: the
 * three equipped slots (typed to their concrete slot) and every owned item
 * grouped by slot, sorted alphabetically. Rows whose `catalogItemKey` no
 * longer resolves to a shipped catalog entry are dropped — they cannot be
 * rendered or grouped without an item shape.
 */
export function resolveInventory(
  inventory: HydratedInventoryItem[]
): ResolvedInventory {
  const resolved: ResolvedInventoryEntry[] = inventory
    .filter(
      (entry): entry is HydratedInventoryItem & { item: EquippableItem } =>
        Boolean(entry.item)
    )
    .map((entry) => ({ item: entry.item, equipped: entry.equipped }))

  const itemsBySlot: ItemsBySlot = {
    weapon: filterAndSort(resolved, "weapon"),
    armor: filterAndSort(resolved, "armor"),
    accessory: filterAndSort(resolved, "accessory"),
  }

  return {
    equippedWeapon:
      (itemsBySlot.weapon.find((e) => e.equipped)?.item as
        | Weapon
        | undefined) ?? null,
    equippedArmor:
      (itemsBySlot.armor.find((e) => e.equipped)?.item as Armor | undefined) ??
      null,
    equippedAccessory:
      (itemsBySlot.accessory.find((e) => e.equipped)?.item as
        | Accessory
        | undefined) ?? null,
    itemsBySlot,
  }
}

function filterAndSort(
  entries: ResolvedInventoryEntry[],
  slot: EquippableItem["slot"]
): ResolvedInventoryEntry[] {
  return entries
    .filter((entry) => entry.item.slot === slot)
    .sort((a, b) => a.item.name.localeCompare(b.item.name))
}
