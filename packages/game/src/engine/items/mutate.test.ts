import { describe, expect, it } from "vitest"

import {
  makeConsumable,
  makeWeapon,
} from "@workspace/game/engine/__fixtures__/fixtures"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { applyInventoryMutation } from "@workspace/game/engine/items/mutate"
import { type InventoryItemState } from "@workspace/game/engine/items/utils"
import { type InventoryMutation } from "@workspace/game/foundation/items/schema"

/** A synthetic catalog: a non-stackable weapon and a stackable consumable, so
 *  each routed mutation has a distinct observable outcome. */
const DATA = makeTestGameData({
  items: [makeWeapon("sword"), makeConsumable("potion", 10)],
})

const apply = (
  items: readonly InventoryItemState[],
  mutation: InventoryMutation
) => applyInventoryMutation(items, mutation, DATA, () => "new-id")

const sword: InventoryItemState = {
  id: "row-sword",
  catalogItemKey: "sword",
  equipped: false,
  quantity: 1,
}
const potion: InventoryItemState = {
  id: "row-potion",
  catalogItemKey: "potion",
  equipped: false,
  quantity: 3,
}

describe("applyInventoryMutation", () => {
  it("routes equip to equipItem", () => {
    const result = apply([sword], { kind: "equip", itemId: "row-sword" })
    expect(result.ok && result.value).toEqual([{ ...sword, equipped: true }])
  })

  it("routes unequip to unequipItem", () => {
    const result = apply([{ ...sword, equipped: true }], {
      kind: "unequip",
      itemId: "row-sword",
    })
    expect(result.ok && result.value).toEqual([sword])
  })

  it("routes add to addItem (minting ids via the injected generator)", () => {
    const result = apply([], {
      kind: "add",
      catalogItemKey: "sword",
      quantity: 1,
    })
    expect(result.ok && result.value).toEqual([
      { id: "new-id", catalogItemKey: "sword", equipped: false, quantity: 1 },
    ])
  })

  it("routes add to addItem (topping up an existing stack)", () => {
    const result = apply([potion], {
      kind: "add",
      catalogItemKey: "potion",
      quantity: 2,
    })
    expect(result.ok && result.value).toEqual([{ ...potion, quantity: 5 }])
  })

  it("routes setQuantity to setItemQuantity", () => {
    const result = apply([potion], {
      kind: "setQuantity",
      itemId: "row-potion",
      quantity: 7,
    })
    expect(result.ok && result.value).toEqual([{ ...potion, quantity: 7 }])
  })

  it("routes remove to removeItem", () => {
    const result = apply([sword, potion], {
      kind: "remove",
      itemId: "row-sword",
    })
    expect(result.ok && result.value).toEqual([potion])
  })

  it("surfaces a routed engine error (unknown catalog key on add)", () => {
    const result = apply([], {
      kind: "add",
      catalogItemKey: "nope",
      quantity: 1,
    })
    expect(result).toEqual({ ok: false, error: "catalog-item-unknown" })
  })
})
