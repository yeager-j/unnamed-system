import { describe, expect, it } from "vitest"

import { mechanicStateSchema } from "./schema"
import { STAIN_ELEMENTS, STAIN_SLOT_COUNT, stains } from "./stains"

describe("stains", () => {
  it("starts with four empty slots", () => {
    expect(stains.initialState()).toEqual({
      kind: "stains",
      tokens: [null, null, null, null],
    })
    expect(stains.initialState().tokens).toHaveLength(STAIN_SLOT_COUNT)
  })

  it("restricts the element set to Fire / Ice / Elec / Wind / Light", () => {
    expect([...STAIN_ELEMENTS]).toEqual([
      "fire",
      "ice",
      "elec",
      "wind",
      "light",
    ])
  })

  it("emits no Effects in MVP", () => {
    expect(stains.effects).toBeUndefined()
  })

  it("validates a four-slot state with mixed elements + nulls", () => {
    expect(() =>
      mechanicStateSchema.parse({
        kind: "stains",
        tokens: ["fire", "ice", null, "wind"],
      })
    ).not.toThrow()
  })

  it("rejects a wrong-length tokens array", () => {
    expect(() =>
      mechanicStateSchema.parse({
        kind: "stains",
        tokens: ["fire", "ice", null],
      })
    ).toThrow()
  })

  it("rejects an unknown element", () => {
    expect(() =>
      mechanicStateSchema.parse({
        kind: "stains",
        tokens: ["fire", "psy", null, null],
      })
    ).toThrow()
  })
})
