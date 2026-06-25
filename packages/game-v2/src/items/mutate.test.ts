import { describe, expect, it } from "vitest"

import {
  makeArmor,
  makeItem,
  makeItemLookups,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import {
  addItem,
  applyInventoryMutation,
  equipItem,
  removeItem,
  setItemQuantity,
  unequipItem,
} from "@workspace/game-v2/items/mutate"
import type { Result } from "@workspace/game-v2/kernel/result"

function unwrap<T>(result: Result<T, string>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`)
  return result.value
}

const lookups = makeItemLookups({
  items: [
    makeWeapon({ key: "sword", name: "Sword" }),
    makeWeapon({ key: "axe", name: "Axe" }),
    makeArmor({ key: "mail", name: "Mail" }),
    makeItem({ key: "potion", name: "Potion", stackSize: 5, consumable: true }),
  ],
})

const row = (
  over: Partial<InventoryItemState> & { id: string }
): InventoryItemState => ({
  catalogItemKey: "sword",
  equipped: false,
  quantity: 1,
  ...over,
})

const ids = (items: InventoryItemState[]) => items.map((i) => i.id)
const newId = () => "new"

describe("equipItem — single-slot swap", () => {
  const equip = equipItem(lookups)

  it("equips the target and unequips other items in the SAME slot only", () => {
    const items = [
      row({ id: "sword", catalogItemKey: "sword", equipped: true }),
      row({ id: "axe", catalogItemKey: "axe" }),
      row({ id: "mail", catalogItemKey: "mail", equipped: true }),
    ]
    const result = equip(items, "axe")
    expect(result.ok && result.value).toEqual([
      { id: "sword", catalogItemKey: "sword", equipped: false, quantity: 1 },
      { id: "axe", catalogItemKey: "axe", equipped: true, quantity: 1 },
      { id: "mail", catalogItemKey: "mail", equipped: true, quantity: 1 }, // armor untouched
    ])
  })

  it("item-not-found / catalog-item-unknown (non-equippable)", () => {
    expect(equip([], "x")).toEqual({ ok: false, error: "item-not-found" })
    const items = [row({ id: "p", catalogItemKey: "potion" })]
    expect(equip(items, "p")).toEqual({
      ok: false,
      error: "catalog-item-unknown",
    })
  })

  it("ignores an orphaned equipped row (unshipped key) when computing same-slot conflicts", () => {
    const items = [
      row({ id: "orphan", catalogItemKey: "unshipped", equipped: true }),
      row({ id: "sword", catalogItemKey: "sword" }),
    ]
    const result = equip(items, "sword")
    expect(
      result.ok && result.value.find((i) => i.id === "orphan")?.equipped
    ).toBe(true)
  })
})

describe("unequipItem", () => {
  it("is idempotent and errors on a miss", () => {
    const items = [
      row({ id: "sword", catalogItemKey: "sword", equipped: true }),
    ]
    expect(unequipItem(items, "sword")).toEqual({
      ok: true,
      value: [
        { id: "sword", catalogItemKey: "sword", equipped: false, quantity: 1 },
      ],
    })
    expect(unequipItem(items, "x")).toEqual({
      ok: false,
      error: "item-not-found",
    })
  })
})

describe("addItem — top-up-then-overflow", () => {
  const add = addItem(lookups)

  it("tops up existing stackable rows, then overflows into new rows capped at stackSize", () => {
    // potion stackSize 5; existing row at 3, add 9 → top up to 5 (+2), overflow 7 → 5 + 2.
    const items = [row({ id: "p1", catalogItemKey: "potion", quantity: 3 })]
    let n = 0
    const result = addItem(lookups)(items, "potion", 9, () => `n${n++}`)
    expect(result.ok && result.value.map((i) => i.quantity)).toEqual([5, 5, 2])
  })

  it("non-stackable always creates separate single-unit rows", () => {
    let n = 0
    const result = add([], "sword", 3, () => `n${n++}`)
    expect(result.ok && result.value).toHaveLength(3)
    expect(result.ok && result.value.every((i) => i.quantity === 1)).toBe(true)
  })

  it("rejects invalid quantity and unshipped key", () => {
    expect(add([], "potion", 0, newId)).toEqual({
      ok: false,
      error: "invalid-quantity",
    })
    expect(add([], "potion", -1, newId)).toEqual({
      ok: false,
      error: "invalid-quantity",
    })
    expect(add([], "potion", 1.5, newId)).toEqual({
      ok: false,
      error: "invalid-quantity",
    })
    expect(add([], "ghost", 1, newId)).toEqual({
      ok: false,
      error: "catalog-item-unknown",
    })
  })
})

describe("setItemQuantity — clamp/drop", () => {
  const set = setItemQuantity(lookups)

  it("clamps to [0, stackSize] with floor; 0 (or negative) drops the row", () => {
    const items = [
      row({ id: "p", catalogItemKey: "potion", quantity: 2 }),
      row({ id: "q", catalogItemKey: "potion", quantity: 1 }),
    ]
    const qtyOfP = (q: number) =>
      unwrap(set(items, "p", q)).find((i) => i.id === "p")?.quantity
    expect(qtyOfP(9)).toBe(5) // clamped to stackSize
    expect(qtyOfP(3.9)).toBe(3) // floored
    expect(ids(unwrap(set(items, "p", 0)))).toEqual(["q"]) // dropped
    expect(ids(unwrap(set(items, "p", -1)))).toEqual(["q"]) // clamps to 0 → dropped
  })

  it("item-not-found on a miss", () => {
    expect(set([], "x", 1)).toEqual({ ok: false, error: "item-not-found" })
  })
})

describe("removeItem", () => {
  it("removes by id even when equipped; errors on a miss", () => {
    const items = [
      row({ id: "sword", catalogItemKey: "sword", equipped: true }),
    ]
    expect(removeItem(items, "sword")).toEqual({ ok: true, value: [] })
    expect(removeItem(items, "x")).toEqual({
      ok: false,
      error: "item-not-found",
    })
  })
})

describe("applyInventoryMutation — router", () => {
  it("routes each mutation kind to its transition", () => {
    const items = [row({ id: "sword", catalogItemKey: "sword" })]
    expect(
      applyInventoryMutation(
        items,
        { kind: "equip", itemId: "sword" },
        lookups,
        newId
      ).ok
    ).toBe(true)
    expect(
      applyInventoryMutation(
        items,
        { kind: "unequip", itemId: "sword" },
        lookups,
        newId
      ).ok
    ).toBe(true)
    expect(
      applyInventoryMutation(
        items,
        { kind: "add", catalogItemKey: "potion", quantity: 1 },
        lookups,
        newId
      ).ok
    ).toBe(true)
    expect(
      applyInventoryMutation(
        items,
        { kind: "setQuantity", itemId: "sword", quantity: 1 },
        lookups,
        newId
      ).ok
    ).toBe(true)
    expect(
      applyInventoryMutation(
        items,
        { kind: "remove", itemId: "sword" },
        lookups,
        newId
      ).ok
    ).toBe(true)
    // surfaces the underlying error unchanged
    expect(
      applyInventoryMutation(
        items,
        { kind: "add", catalogItemKey: "ghost", quantity: 1 },
        lookups,
        newId
      )
    ).toEqual({
      ok: false,
      error: "catalog-item-unknown",
    })
  })
})
