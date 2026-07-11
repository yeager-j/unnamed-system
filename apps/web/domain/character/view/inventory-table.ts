import type { EquipSlot, ResolvedInventory } from "@workspace/game-v2/items"

/**
 * The Inventory table's row shaping + filter predicates (S2c — UNN-559,
 * folding in UNN-163): pure helpers the tab's Data Table delegates to, so the
 * flatten order and the search/filter semantics are unit-tested here and the
 * component stays layout-only.
 */

export type InventoryGroup = EquipSlot | "consumable"

/** One table row — the resolved entry flattened to what the columns render. */
export interface InventoryRow {
  id: string
  name: string
  description: string
  group: InventoryGroup
  quantity: number
  equipped: boolean
  /** `stackSize > 1` — whether the qty cell offers a stepper. */
  stackable: boolean
  /** The row's max quantity (its catalog `stackSize`). */
  stackSize: number
  /** Whether the actions cell offers Equip/Unequip. */
  equippable: boolean
}

/** Flattens the resolved inventory in display order: the three equip slots
 *  (each already name-sorted by the resolver), then consumables. */
export function buildInventoryRows(
  inventory: ResolvedInventory
): InventoryRow[] {
  const equippables = (["weapon", "armor", "accessory"] as const).flatMap(
    (slot) =>
      inventory.itemsBySlot[slot].map(
        (entry): InventoryRow => ({
          id: entry.id,
          name: entry.item.name,
          description: entry.item.description,
          group: slot,
          quantity: entry.quantity,
          equipped: entry.equipped,
          stackable: entry.item.stackSize > 1,
          stackSize: entry.item.stackSize,
          equippable: true,
        })
      )
  )
  const consumables = inventory.consumables.map(
    (entry): InventoryRow => ({
      id: entry.id,
      name: entry.item.name,
      description: entry.item.description,
      group: "consumable",
      quantity: entry.quantity,
      equipped: false,
      stackable: entry.item.stackSize > 1,
      stackSize: entry.item.stackSize,
      equippable: false,
    })
  )
  return [...equippables, ...consumables]
}

/** Case-insensitive substring match over name + description; an empty or
 *  whitespace query matches everything. */
export function rowMatchesQuery(row: InventoryRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") return true
  return (
    row.name.toLowerCase().includes(needle) ||
    row.description.toLowerCase().includes(needle)
  )
}

/** Group-chip filter — an empty selection means "no filter", not "nothing". */
export function rowMatchesGroups(
  row: InventoryRow,
  groups: readonly InventoryGroup[]
): boolean {
  return groups.length === 0 || groups.includes(row.group)
}
