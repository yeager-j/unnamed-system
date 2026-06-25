import { describe, expect, it } from "vitest"

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

  it("rejects a malformed row", () => {
    const result = loadEntity("e", { equipment: { items: [{ id: "a" }] } })
    expect(result.ok).toBe(false)
  })
})
