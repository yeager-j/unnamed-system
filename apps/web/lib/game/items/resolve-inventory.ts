import type { HydratedInventoryItem } from "../character/stats/hydrated-character"
import type { Accessory, Armor, EquippableItem, Weapon } from "./schema"

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
