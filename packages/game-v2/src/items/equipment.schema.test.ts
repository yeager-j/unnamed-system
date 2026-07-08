import { describe, expect, it } from "vitest"

import {
  MAX_CURRENCY,
  setCurrency,
} from "@workspace/game-v2/items/equipment.schema"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"

describe("Equipment component load-seam round-trip", () => {
  it("loads a valid equipment component", () => {
    const result = loadEntity("e", {
      equipment: {
        items: [
          { id: "a", catalogItemKey: "sword", equipped: true, quantity: 1 },
        ],
      },
    })
    expect(result.ok && result.value.components.equipment?.items).toHaveLength(
      1
    )
  })

  it("defaults `items` to [] (additive/forward-compatible migration)", () => {
    const result = loadEntity("e", { equipment: {} })
    expect(result.ok && result.value.components.equipment?.items).toEqual([])
  })

  it("defaults `currency` to 0 (pre-UNN-559 rows carry no wallet field)", () => {
    const result = loadEntity("e", { equipment: {} })
    expect(result.ok && result.value.components.equipment?.currency).toBe(0)
  })

  it("rejects a malformed row", () => {
    const result = loadEntity("e", { equipment: { items: [{ id: "a" }] } })
    expect(result.ok).toBe(false)
  })
})

describe("setCurrency", () => {
  const wallet = (currency: number) => ({ items: [], currency })

  it("sets an absolute amount, preserving items", () => {
    const items = [
      { id: "a", catalogItemKey: "sword", equipped: true, quantity: 1 },
    ]
    expect(setCurrency({ items, currency: 5 }, 120)).toEqual({
      items,
      currency: 120,
    })
  })

  it("floors fractions and clamps below at 0", () => {
    expect(setCurrency(wallet(10), 7.9).currency).toBe(7)
    expect(setCurrency(wallet(10), -3).currency).toBe(0)
  })

  it("clamps above at MAX_CURRENCY", () => {
    expect(setCurrency(wallet(0), MAX_CURRENCY + 1).currency).toBe(MAX_CURRENCY)
  })
})
