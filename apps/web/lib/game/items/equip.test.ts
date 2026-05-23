import { describe, expect, it } from "vitest"

import { equipItem, unequipItem, type InventoryItemState } from "./equip"

const longswordA: InventoryItemState = {
  id: "row-longsword",
  catalogItemKey: "longsword",
  equipped: false,
}
const runedCaneA: InventoryItemState = {
  id: "row-runed-cane",
  catalogItemKey: "runed-cane",
  equipped: false,
}
const bladeturnMailA: InventoryItemState = {
  id: "row-bladeturn-mail",
  catalogItemKey: "bladeturn-mail",
  equipped: false,
}
const zephyrBandA: InventoryItemState = {
  id: "row-zephyr-band",
  catalogItemKey: "zephyr-band",
  equipped: false,
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
    }

    const result = equipItem([orphan], orphan.id)

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
