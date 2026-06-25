import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import {
  isConsumable,
  isEquippable,
  isItemForSlot,
  type EquippableItem,
  type EquippedWeapon,
  type EquipSlot,
  type Item,
  type ItemForSlot,
} from "@workspace/game-v2/items/item.schema"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * Inventory display shaping, ported from v1 `engine/items/utils.ts`. Joins each
 * stored row to its catalog item (`getItem`), partitions equippable vs consumable,
 * groups equippables by slot (alphabetical by resolved name), and resolves the
 * equipped item per slot. Rows whose catalog item no longer resolves — or resolve
 * to neither equippable nor consumable — are dropped (no group to render them in).
 */

/** One resolved equippable row: the catalog entry plus its row id, equip state,
 *  and stacked quantity. */
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

/** Shapes the stored inventory rows the Inventory tab needs (see module doc). */
export function resolveInventory(
  lookups: Pick<GameData, "getItem">,
  items: readonly InventoryItemState[]
): ResolvedInventory {
  const equippable: EquippableEntry[] = []
  const consumables: ResolvedConsumableEntry[] = []

  for (const entry of items) {
    const item = lookups.getItem(entry.catalogItemKey)
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

/**
 * The equipped item in `slot` from a stored inventory, narrowed to the concrete
 * slot type, or `null` when nothing is equipped. A character may equip one item
 * per slot; if persisted state ever holds more than one, the first match wins.
 */
export function getEquippedItem<S extends EquipSlot>(
  lookups: Pick<GameData, "getItem">,
  items: readonly InventoryItemState[],
  slot: S
): ItemForSlot<S> | null {
  for (const entry of items) {
    if (!entry.equipped) continue
    const item = lookups.getItem(entry.catalogItemKey)
    if (item && isItemForSlot(item, slot)) return item
  }
  return null
}
