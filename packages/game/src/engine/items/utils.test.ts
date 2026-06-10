import { describe, expect, it } from "vitest"

import {
  magicAccessory,
  makeAccessory,
  makeArmor,
  makeConsumable,
  makeWeapon,
  nullWeapon,
  spAccessory,
  weaknessArmor,
} from "@workspace/game/engine/__fixtures__/fixtures"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  addItem,
  equipItem,
  getEquippedItem,
  removeItem,
  resolveInventory,
  setItemQuantity,
  unequipItem,
  type InventoryItemState,
} from "@workspace/game/engine/items/utils"
import { type HydratedInventoryItem } from "@workspace/game/foundation/character/hydrated-character"
import {
  isConsumable,
  isEquippable,
  isStackable,
  type Item,
} from "@workspace/game/foundation/items/schema"

/**
 * A synthetic item catalog. Keys are opaque ids and the capabilities (slot,
 * stackSize, consumable) are assigned here, so the mutation tests assert the
 * equip/stack/clamp *behavior* against fixtures rather than a shipped item's
 * balance. `soul-drop`'s 999 stack cap is a fixture value, not the catalog's.
 */
const longsword = makeWeapon("longsword")
const runedCane = makeWeapon("runed-cane")
const bladeturnMail = makeArmor("bladeturn-mail", [
  { type: "affinity", damageTypes: ["slash"], affinity: "resist" },
])
const zephyrBand = makeAccessory("zephyr-band", [
  { type: "attribute", target: "agility", amount: 1 },
])
const soulDrop = makeConsumable("soul-drop", 999)

const TEST_DATA = makeTestGameData({
  items: [longsword, runedCane, bladeturnMail, zephyrBand, soulDrop],
})

/** Bind the fixture catalog so the item-mutation call sites stay terse. */
const doEquip = equipItem(TEST_DATA)
const doAdd = addItem(TEST_DATA)
const doSetQty = setItemQuantity(TEST_DATA)

const longswordA: InventoryItemState = {
  id: "row-longsword",
  catalogItemKey: "longsword",
  equipped: false,
  quantity: 1,
}
const runedCaneA: InventoryItemState = {
  id: "row-runed-cane",
  catalogItemKey: "runed-cane",
  equipped: false,
  quantity: 1,
}
const bladeturnMailA: InventoryItemState = {
  id: "row-bladeturn-mail",
  catalogItemKey: "bladeturn-mail",
  equipped: false,
  quantity: 1,
}
const zephyrBandA: InventoryItemState = {
  id: "row-zephyr-band",
  catalogItemKey: "zephyr-band",
  equipped: false,
  quantity: 1,
}
const soulDropA: InventoryItemState = {
  id: "row-soul-drop",
  catalogItemKey: "soul-drop",
  equipped: false,
  quantity: 5,
}

/** A deterministic id factory so new-row assertions are stable. */
function sequentialIds() {
  let n = 0
  return () => `new-${n++}`
}

describe("equipItem", () => {
  it("equips the targeted item when its slot is empty", () => {
    const result = doEquip([longswordA, bladeturnMailA], longswordA.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { ...longswordA, equipped: true },
      bladeturnMailA,
    ])
  })

  it("auto-unequips the previously equipped item in the same slot", () => {
    const result = doEquip(
      [{ ...longswordA, equipped: true }, runedCaneA, bladeturnMailA],
      runedCaneA.id
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { ...longswordA, equipped: false },
      { ...runedCaneA, equipped: true },
      bladeturnMailA,
    ])
  })

  it("does not touch equipped items in other slots", () => {
    const result = doEquip(
      [longswordA, { ...bladeturnMailA, equipped: true }, zephyrBandA],
      zephyrBandA.id
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      longswordA,
      { ...bladeturnMailA, equipped: true },
      { ...zephyrBandA, equipped: true },
    ])
  })

  it("returns item-not-found when no row matches the id", () => {
    const result = doEquip([longswordA], "row-missing")

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("returns catalog-item-unknown when the row's catalogItemKey is unshipped", () => {
    const orphan: InventoryItemState = {
      id: "row-orphan",
      catalogItemKey: "unshipped-item",
      equipped: false,
      quantity: 1,
    }

    const result = doEquip([orphan], orphan.id)

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it("returns catalog-item-unknown for a non-equippable consumable", () => {
    const result = doEquip([soulDropA], soulDropA.id)

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it("does not mutate the input array", () => {
    const items = [longswordA, runedCaneA]
    const before = JSON.stringify(items)

    doEquip(items, longswordA.id)

    expect(JSON.stringify(items)).toBe(before)
  })

  it("ignores orphaned currently-equipped rows when computing conflicts", () => {
    const orphanEquipped: InventoryItemState = {
      id: "row-orphan",
      catalogItemKey: "unshipped-item",
      equipped: true,
      quantity: 1,
    }

    const result = doEquip([orphanEquipped, longswordA], longswordA.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      orphanEquipped,
      { ...longswordA, equipped: true },
    ])
  })
})

describe("unequipItem", () => {
  it("unequips an equipped row", () => {
    const result = unequipItem(
      [{ ...longswordA, equipped: true }, bladeturnMailA],
      longswordA.id
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA, bladeturnMailA])
  })

  it("is idempotent when the row is already unequipped", () => {
    const result = unequipItem([longswordA], longswordA.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("leaves other equipped rows untouched", () => {
    const result = unequipItem(
      [
        { ...longswordA, equipped: true },
        { ...bladeturnMailA, equipped: true },
      ],
      longswordA.id
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      longswordA,
      { ...bladeturnMailA, equipped: true },
    ])
  })

  it("returns item-not-found when no row matches the id", () => {
    const result = unequipItem([longswordA], "row-missing")

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("does not mutate the input array", () => {
    const items = [{ ...longswordA, equipped: true }]
    const before = JSON.stringify(items)

    unequipItem(items, longswordA.id)

    expect(JSON.stringify(items)).toBe(before)
  })
})

describe("addItem", () => {
  it("creates one new row when adding a single non-stackable item", () => {
    const result = doAdd([], "longsword", 1, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      {
        id: "new-0",
        catalogItemKey: "longsword",
        equipped: false,
        quantity: 1,
      },
    ])
  })

  it("creates separate rows for each unit of a non-stackable item", () => {
    const result = doAdd([longswordA], "longsword", 2, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      longswordA,
      {
        id: "new-0",
        catalogItemKey: "longsword",
        equipped: false,
        quantity: 1,
      },
      {
        id: "new-1",
        catalogItemKey: "longsword",
        equipped: false,
        quantity: 1,
      },
    ])
  })

  it("stacks a stackable item into one new row", () => {
    const result = doAdd([], "soul-drop", 7, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      {
        id: "new-0",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 7,
      },
    ])
  })

  it("tops up an existing stackable row before creating a new one", () => {
    const result = doAdd([soulDropA], "soul-drop", 3, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 8 }])
  })

  it("overflows into a new row once the existing stack is full", () => {
    const nearFull: InventoryItemState = { ...soulDropA, quantity: 998 }

    const result = doAdd([nearFull], "soul-drop", 5, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { ...nearFull, quantity: 999 },
      {
        id: "new-0",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 4,
      },
    ])
  })

  it("chains overflow rows when adding beyond one stack from empty", () => {
    const result = doAdd([], "soul-drop", 1000, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      {
        id: "new-0",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 999,
      },
      {
        id: "new-1",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 1,
      },
    ])
  })

  it("returns catalog-item-unknown for an unshipped key", () => {
    const result = doAdd([], "nope", 1, sequentialIds())

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it.each([0, -1, 1.5])("returns invalid-quantity for %s", (quantity) => {
    const result = doAdd([], "soul-drop", quantity, sequentialIds())

    expect(result).toEqual({ ok: false, error: "invalid-quantity" })
  })

  it("does not mutate the input array", () => {
    const items = [soulDropA]
    const before = JSON.stringify(items)

    doAdd(items, "soul-drop", 3, sequentialIds())

    expect(JSON.stringify(items)).toBe(before)
  })
})

describe("setItemQuantity", () => {
  it("sets a stackable row's quantity", () => {
    const result = doSetQty([soulDropA], soulDropA.id, 12)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 12 }])
  })

  it("clamps above stackSize", () => {
    const result = doSetQty([soulDropA], soulDropA.id, 5000)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 999 }])
  })

  it("removes the row when set to 0", () => {
    const result = doSetQty([soulDropA, longswordA], soulDropA.id, 0)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("removes the row when set negative (clamped to 0)", () => {
    const result = doSetQty([soulDropA], soulDropA.id, -3)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it("clamps a non-stackable row to 1", () => {
    const result = doSetQty([longswordA], longswordA.id, 9)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("clamps an orphaned (unshipped) row to a stackSize of 1", () => {
    const orphan: InventoryItemState = {
      id: "row-orphan",
      catalogItemKey: "unshipped-item",
      equipped: false,
      quantity: 1,
    }

    const result = doSetQty([orphan], orphan.id, 9)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([orphan])
  })

  it("leaves rows other than the target unchanged", () => {
    const result = doSetQty([longswordA, soulDropA], soulDropA.id, 12)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA, { ...soulDropA, quantity: 12 }])
  })

  it("returns item-not-found when no row matches", () => {
    const result = doSetQty([soulDropA], "row-missing", 2)

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("does not mutate the input array", () => {
    const items = [soulDropA]
    const before = JSON.stringify(items)

    doSetQty(items, soulDropA.id, 0)

    expect(JSON.stringify(items)).toBe(before)
  })
})

describe("removeItem", () => {
  it("removes the row by id", () => {
    const result = removeItem([soulDropA, longswordA], soulDropA.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("removes an equipped row (structurally unequipping it)", () => {
    const equipped = { ...longswordA, equipped: true }

    const result = removeItem([equipped, bladeturnMailA], equipped.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([bladeturnMailA])
  })

  it("returns item-not-found when no row matches", () => {
    const result = removeItem([longswordA], "row-missing")

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("does not mutate the input array", () => {
    const items = [soulDropA, longswordA]
    const before = JSON.stringify(items)

    removeItem(items, soulDropA.id)

    expect(JSON.stringify(items)).toBe(before)
  })
})

describe("capability traits", () => {
  it("classifies an equippable weapon", () => {
    const item = TEST_DATA.getItem("longsword")
    expect(item).toBeDefined()
    if (!item) return
    expect(isEquippable(item)).toBe(true)
    expect(isStackable(item)).toBe(false)
    expect(isConsumable(item)).toBe(false)
  })

  it("classifies the stackable consumable that cannot be equipped", () => {
    const item = TEST_DATA.getItem("soul-drop")
    expect(item).toBeDefined()
    if (!item) return
    expect(isEquippable(item)).toBe(false)
    expect(isStackable(item)).toBe(true)
    expect(isConsumable(item)).toBe(true)
    expect(item.stackSize).toBe(999)
    expect(TEST_DATA.getEquippableItem("soul-drop")).toBeUndefined()
  })
})

/** A bare material: neither equippable (no `equip`) nor consumable. */
const material: Item = {
  key: "fixture-material",
  name: "Fixture Material",
  description: "Test-only: a plain material.",
  stackSize: 1,
}

/** A consumable elixir, so resolveInventory has a consumables branch to fill. */
const elixir: Item = {
  key: "fixture-elixir",
  name: "Fixture Elixir",
  description: "Test-only: a consumable.",
  stackSize: 5,
  consumable: true,
}

/** Builds a hydrated inventory row from a resolved catalog `item`. */
function row(
  id: string,
  item: Item | undefined,
  overrides: { equipped?: boolean; quantity?: number } = {}
): HydratedInventoryItem {
  return {
    id,
    characterId: "char-1",
    catalogItemKey: item?.key ?? "unshipped",
    equipped: overrides.equipped ?? false,
    quantity: overrides.quantity ?? 1,
    item,
  }
}

describe("resolveInventory", () => {
  it("groups equippable rows by their slot", () => {
    const resolved = resolveInventory([
      row("w", nullWeapon),
      row("a", weaknessArmor),
      row("c", magicAccessory),
    ])

    expect(resolved.itemsBySlot.weapon.map((e) => e.id)).toEqual(["w"])
    expect(resolved.itemsBySlot.armor.map((e) => e.id)).toEqual(["a"])
    expect(resolved.itemsBySlot.accessory.map((e) => e.id)).toEqual(["c"])
  })

  it("carries each row's id, equip state, and quantity onto the entry", () => {
    const resolved = resolveInventory([
      row("w", nullWeapon, { equipped: true, quantity: 3 }),
    ])

    expect(resolved.itemsBySlot.weapon).toEqual([
      { id: "w", item: nullWeapon, equipped: true, quantity: 3 },
    ])
  })

  it("resolves the equipped item per slot", () => {
    const resolved = resolveInventory([
      row("w", nullWeapon, { equipped: true }),
      row("a", weaknessArmor, { equipped: true }),
      row("c", magicAccessory, { equipped: true }),
    ])

    expect(resolved.equippedWeapon).toBe(nullWeapon)
    expect(resolved.equippedArmor).toBe(weaknessArmor)
    expect(resolved.equippedAccessory).toBe(magicAccessory)
  })

  it("leaves each equipped slot null when nothing in it is equipped", () => {
    const resolved = resolveInventory([
      row("w", nullWeapon),
      row("a", weaknessArmor),
      row("c", magicAccessory),
    ])

    expect(resolved.equippedWeapon).toBeNull()
    expect(resolved.equippedArmor).toBeNull()
    expect(resolved.equippedAccessory).toBeNull()
  })

  it("picks the equipped accessory rather than the first one in the slot", () => {
    const resolved = resolveInventory([
      row("sp", spAccessory, { equipped: true }),
      row("magic", magicAccessory),
    ])

    expect(resolved.equippedAccessory).toBe(spAccessory)
  })

  it("sorts entries within a slot alphabetically by name", () => {
    const resolved = resolveInventory([
      row("sp", spAccessory),
      row("magic", magicAccessory),
    ])

    expect(resolved.itemsBySlot.accessory.map((e) => e.item.name)).toEqual([
      "Fixture Magic Accessory",
      "Fixture SP Accessory",
    ])
  })

  it("collects consumable rows and sorts them by name", () => {
    const second: Item = { ...elixir, key: "fixture-elixir-2", name: "Zelixir" }
    const resolved = resolveInventory([
      row("z", second, { quantity: 2 }),
      row("e", elixir, { quantity: 4 }),
    ])

    expect(resolved.consumables).toEqual([
      { id: "e", item: elixir, quantity: 4 },
      { id: "z", item: second, quantity: 2 },
    ])
  })

  it("drops rows whose catalog item failed to resolve", () => {
    const resolved = resolveInventory([
      row("ghost", undefined),
      row("w", nullWeapon),
    ])

    expect(resolved.itemsBySlot.weapon.map((e) => e.id)).toEqual(["w"])
    expect(resolved.consumables).toEqual([])
  })

  it("drops rows that are neither equippable nor consumable", () => {
    const resolved = resolveInventory([row("m", material), row("e", elixir)])

    expect(resolved.itemsBySlot.weapon).toEqual([])
    expect(resolved.itemsBySlot.armor).toEqual([])
    expect(resolved.itemsBySlot.accessory).toEqual([])
    expect(resolved.consumables).toEqual([
      { id: "e", item: elixir, quantity: 1 },
    ])
  })
})

describe("getEquippedItem (weapon)", () => {
  it("returns the equipped Weapon when one is equipped", () => {
    const inventory = [
      { equipped: false, item: bladeturnMail },
      { equipped: true, item: longsword },
    ]
    expect(getEquippedItem(inventory, "weapon")).toBe(longsword)
  })

  it("returns null when no item is equipped", () => {
    const inventory = [
      { equipped: false, item: longsword },
      { equipped: false, item: bladeturnMail },
    ]
    expect(getEquippedItem(inventory, "weapon")).toBeNull()
  })

  it("returns null when the only equipped item is not a weapon", () => {
    const inventory = [
      { equipped: true, item: bladeturnMail },
      { equipped: false, item: longsword },
    ]
    expect(getEquippedItem(inventory, "weapon")).toBeNull()
  })

  it("ignores unequipped weapons in favor of the equipped one", () => {
    const inventory = [
      { equipped: false, item: longsword },
      { equipped: true, item: runedCane },
    ]
    expect(getEquippedItem(inventory, "weapon")).toBe(runedCane)
  })

  it("returns null when the entry's catalog item is undefined", () => {
    const inventory = [{ equipped: true, item: undefined }]
    expect(getEquippedItem(inventory, "weapon")).toBeNull()
  })
})
