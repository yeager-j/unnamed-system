import { describe, expect, it } from "vitest"

import {
  makeAccessory,
  makeArmor,
  makeItem,
  makeItemLookups,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import {
  getEquippedItem,
  resolveInventory,
} from "@workspace/game-v2/items/resolve-inventory"

const lookups = makeItemLookups({
  items: [
    makeWeapon({ key: "axe", name: "Axe" }),
    makeWeapon({ key: "sword", name: "Sword" }),
    makeArmor({ key: "mail", name: "Mail" }),
    makeAccessory({ key: "ring", name: "Ring" }),
    makeItem({ key: "elixir", name: "Elixir", consumable: true }),
    makeItem({ key: "balm", name: "Balm", consumable: true }),
    makeItem({ key: "junk", name: "Junk" }), // neither equippable nor consumable
  ],
})

const row = (
  id: string,
  catalogItemKey: string,
  equipped = false
): InventoryItemState => ({ id, catalogItemKey, equipped, quantity: 1 })

describe("resolveInventory", () => {
  it("groups by slot, sorts by name, and picks the equipped item per slot", () => {
    const inventory = resolveInventory(lookups, [
      row("w1", "sword"),
      row("w2", "axe", true),
      row("a1", "mail", true),
      row("ac1", "ring"),
      row("c1", "elixir"),
      row("c2", "balm"),
    ])

    expect(inventory.itemsBySlot.weapon.map((e) => e.item.name)).toEqual([
      "Axe",
      "Sword",
    ])
    expect(inventory.equippedWeapon?.name).toBe("Axe")
    expect(inventory.equippedArmor?.name).toBe("Mail")
    expect(inventory.equippedAccessory).toBeNull()
    expect(inventory.consumables.map((c) => c.item.name)).toEqual([
      "Balm",
      "Elixir",
    ])
  })

  it("drops rows whose catalog item is unresolved or is neither equippable nor consumable", () => {
    const inventory = resolveInventory(lookups, [
      row("g", "ghost"),
      row("j", "junk"),
    ])
    expect(inventory.itemsBySlot.weapon).toEqual([])
    expect(inventory.consumables).toEqual([])
  })
})

describe("getEquippedItem", () => {
  it("returns the equipped item in the slot, narrowed; null otherwise", () => {
    const items = [row("w", "sword", true), row("a", "mail", true)]
    expect(getEquippedItem(lookups, items, "weapon")?.name).toBe("Sword")
    expect(getEquippedItem(lookups, items, "accessory")).toBeNull()
    // an equipped row of a different slot doesn't count for "weapon"
    expect(
      getEquippedItem(lookups, [row("a", "mail", true)], "weapon")
    ).toBeNull()
  })
})
