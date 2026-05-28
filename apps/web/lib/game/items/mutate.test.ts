import { describe, expect, it } from "vitest"

import type { HydratedInventoryItem } from "../character"
import { reduceHydratedInventory } from "./mutate"
import { getItem } from "./registry"

const characterId = "char-1"

function hydrate(
  partial: Pick<
    HydratedInventoryItem,
    "id" | "catalogItemKey" | "equipped" | "quantity"
  >
): HydratedInventoryItem {
  return { characterId, item: getItem(partial.catalogItemKey), ...partial }
}

const longsword = hydrate({
  id: "row-longsword",
  catalogItemKey: "longsword",
  equipped: true,
  quantity: 1,
})
const soulDrop = hydrate({
  id: "row-soul-drop",
  catalogItemKey: "soul-drop",
  equipped: false,
  quantity: 5,
})

const sequentialId = () => {
  let n = 0
  return () => `temp-${++n}`
}

describe("reduceHydratedInventory", () => {
  it("adds a consumable as a fully hydrated new row", () => {
    const next = reduceHydratedInventory(
      [longsword],
      { kind: "add", catalogItemKey: "soul-drop", quantity: 2 },
      characterId,
      sequentialId()
    )

    const added = next.find((row) => row.catalogItemKey === "soul-drop")
    expect(added).toMatchObject({
      id: "temp-1",
      characterId,
      catalogItemKey: "soul-drop",
      equipped: false,
      quantity: 2,
    })
    expect(added?.item).toBe(getItem("soul-drop"))
  })

  it("tops up an existing stack rather than adding a row", () => {
    const next = reduceHydratedInventory(
      [soulDrop],
      { kind: "add", catalogItemKey: "soul-drop", quantity: 3 },
      characterId,
      sequentialId()
    )

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: "row-soul-drop", quantity: 8 })
    expect(next[0]?.item).toBe(soulDrop.item)
  })

  it("drops the row when quantity is set to 0", () => {
    const next = reduceHydratedInventory(
      [longsword, soulDrop],
      { kind: "setQuantity", itemId: "row-soul-drop", quantity: 0 },
      characterId
    )

    expect(next).toHaveLength(1)
    expect(next[0]?.id).toBe("row-longsword")
  })

  it("unequips a row while preserving its hydrated entry", () => {
    const next = reduceHydratedInventory(
      [longsword],
      { kind: "unequip", itemId: "row-longsword" },
      characterId
    )

    expect(next[0]).toMatchObject({ id: "row-longsword", equipped: false })
    expect(next[0]?.item).toBe(longsword.item)
  })

  it("returns the input unchanged when the engine rejects the mutation", () => {
    const input = [longsword]
    const next = reduceHydratedInventory(
      input,
      { kind: "remove", itemId: "does-not-exist" },
      characterId
    )

    expect(next).toBe(input)
  })
})
