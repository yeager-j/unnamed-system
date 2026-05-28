import { describe, expect, it } from "vitest"

import { getEquippableItem, getItem } from "./registry"
import { isConsumable, isEquippable, isStackable } from "./schema"
import {
  addItem,
  equipItem,
  removeItem,
  setItemQuantity,
  unequipItem,
  type InventoryItemState,
} from "./utils"

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
    const result = equipItem([longswordA, bladeturnMailA], longswordA.id)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([
      { ...longswordA, equipped: true },
      bladeturnMailA,
    ])
  })

  it("auto-unequips the previously equipped item in the same slot", () => {
    const result = equipItem(
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
    const result = equipItem(
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
    const result = equipItem([longswordA], "row-missing")

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("returns catalog-item-unknown when the row's catalogItemKey is unshipped", () => {
    const orphan: InventoryItemState = {
      id: "row-orphan",
      catalogItemKey: "unshipped-item",
      equipped: false,
      quantity: 1,
    }

    const result = equipItem([orphan], orphan.id)

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it("returns catalog-item-unknown for a non-equippable consumable", () => {
    const result = equipItem([soulDropA], soulDropA.id)

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it("does not mutate the input array", () => {
    const items = [longswordA, runedCaneA]
    const before = JSON.stringify(items)

    equipItem(items, longswordA.id)

    expect(JSON.stringify(items)).toBe(before)
  })

  it("ignores orphaned currently-equipped rows when computing conflicts", () => {
    const orphanEquipped: InventoryItemState = {
      id: "row-orphan",
      catalogItemKey: "unshipped-item",
      equipped: true,
      quantity: 1,
    }

    const result = equipItem([orphanEquipped, longswordA], longswordA.id)

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
    const result = addItem([], "longsword", 1, sequentialIds())

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
    const result = addItem([longswordA], "longsword", 2, sequentialIds())

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
    const result = addItem([], "soul-drop", 7, sequentialIds())

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
    const result = addItem([soulDropA], "soul-drop", 3, sequentialIds())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 8 }])
  })

  it("overflows into a new row once the existing stack is full", () => {
    const nearFull: InventoryItemState = { ...soulDropA, quantity: 998 }

    const result = addItem([nearFull], "soul-drop", 5, sequentialIds())

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
    const result = addItem([], "soul-drop", 1000, sequentialIds())

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
    const result = addItem([], "nope", 1, sequentialIds())

    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })

  it.each([0, -1, 1.5])("returns invalid-quantity for %s", (quantity) => {
    const result = addItem([], "soul-drop", quantity, sequentialIds())

    expect(result).toEqual({ ok: false, error: "invalid-quantity" })
  })

  it("does not mutate the input array", () => {
    const items = [soulDropA]
    const before = JSON.stringify(items)

    addItem(items, "soul-drop", 3, sequentialIds())

    expect(JSON.stringify(items)).toBe(before)
  })
})

describe("setItemQuantity", () => {
  it("sets a stackable row's quantity", () => {
    const result = setItemQuantity([soulDropA], soulDropA.id, 12)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 12 }])
  })

  it("clamps above stackSize", () => {
    const result = setItemQuantity([soulDropA], soulDropA.id, 5000)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([{ ...soulDropA, quantity: 999 }])
  })

  it("removes the row when set to 0", () => {
    const result = setItemQuantity([soulDropA, longswordA], soulDropA.id, 0)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("removes the row when set negative (clamped to 0)", () => {
    const result = setItemQuantity([soulDropA], soulDropA.id, -3)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([])
  })

  it("clamps a non-stackable row to 1", () => {
    const result = setItemQuantity([longswordA], longswordA.id, 9)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual([longswordA])
  })

  it("returns item-not-found when no row matches", () => {
    const result = setItemQuantity([soulDropA], "row-missing", 2)

    expect(result).toEqual({ ok: false, error: "item-not-found" })
  })

  it("does not mutate the input array", () => {
    const items = [soulDropA]
    const before = JSON.stringify(items)

    setItemQuantity(items, soulDropA.id, 0)

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
    const longsword = getItem("longsword")
    expect(longsword).toBeDefined()
    if (!longsword) return
    expect(isEquippable(longsword)).toBe(true)
    expect(isStackable(longsword)).toBe(false)
    expect(isConsumable(longsword)).toBe(false)
  })

  it("classifies Soul Drop as a stackable consumable that cannot be equipped", () => {
    const soulDrop = getItem("soul-drop")
    expect(soulDrop).toBeDefined()
    if (!soulDrop) return
    expect(isEquippable(soulDrop)).toBe(false)
    expect(isStackable(soulDrop)).toBe(true)
    expect(isConsumable(soulDrop)).toBe(true)
    expect(soulDrop.stackSize).toBe(999)
    expect(getEquippableItem("soul-drop")).toBeUndefined()
  })
})
