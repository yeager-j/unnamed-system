import { describe, expect, it } from "vitest"

import {
  adjustCurrency,
  MAX_CURRENCY,
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

describe("adjustCurrency", () => {
  const wallet = (currency: number) => ({ items: [], currency })

  it("applies a signed delta, preserving items", () => {
    const items = [
      { id: "a", catalogItemKey: "sword", equipped: true, quantity: 1 },
    ]
    expect(adjustCurrency({ items, currency: 5 }, 35)).toEqual({
      items,
      currency: 40,
    })
    expect(adjustCurrency({ items, currency: 40 }, -15).currency).toBe(25)
  })

  it("truncates fractional deltas", () => {
    expect(adjustCurrency(wallet(10), 7.9).currency).toBe(17)
    expect(adjustCurrency(wallet(10), -7.9).currency).toBe(3)
  })

  it("clamps below at 0 (an over-spend empties the purse)", () => {
    expect(adjustCurrency(wallet(10), -25).currency).toBe(0)
  })

  it("clamps above at MAX_CURRENCY", () => {
    expect(adjustCurrency(wallet(MAX_CURRENCY), 1).currency).toBe(MAX_CURRENCY)
  })
})
