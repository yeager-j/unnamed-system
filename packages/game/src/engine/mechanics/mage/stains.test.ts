import { describe, expect, it } from "vitest"

import {
  clearStains,
  setStainSlot,
  stains,
} from "@workspace/game/engine/mechanics/mage/stains"
import {
  mechanicStateSchema,
  STAIN_ELEMENTS,
  STAIN_SLOT_COUNT,
  type StainsState,
} from "@workspace/game/foundation/mechanics/schema"

const empty: StainsState = stains.initialState()

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

  describe("setStainSlot", () => {
    it("fills an empty slot without disturbing the others", () => {
      expect(setStainSlot(empty, 1, "ice").tokens).toEqual([
        null,
        "ice",
        null,
        null,
      ])
    })

    it("replaces an occupied slot", () => {
      const state: StainsState = {
        kind: "stains",
        tokens: ["fire", "ice", "elec", "wind"],
      }
      expect(setStainSlot(state, 2, "light").tokens).toEqual([
        "fire",
        "ice",
        "light",
        "wind",
      ])
    })

    it("removes a Stain when the element is null", () => {
      const state: StainsState = {
        kind: "stains",
        tokens: ["fire", "ice", null, null],
      }
      expect(setStainSlot(state, 0, null).tokens).toEqual([
        null,
        "ice",
        null,
        null,
      ])
    })

    it("is a no-op for an out-of-range index", () => {
      expect(setStainSlot(empty, STAIN_SLOT_COUNT, "fire")).toEqual(empty)
      expect(setStainSlot(empty, -1, "fire")).toEqual(empty)
    })

    it("does not mutate the input state", () => {
      setStainSlot(empty, 0, "fire")
      expect(empty.tokens).toEqual([null, null, null, null])
    })

    it("produces a state that still validates", () => {
      expect(() =>
        mechanicStateSchema.parse(setStainSlot(empty, 3, "wind"))
      ).not.toThrow()
    })
  })

  describe("clearStains", () => {
    it("empties every slot", () => {
      const state: StainsState = {
        kind: "stains",
        tokens: ["fire", "ice", "elec", "wind"],
      }
      expect(clearStains(state).tokens).toEqual([null, null, null, null])
    })
  })
})
