import { describe, expect, it } from "vitest"

import {
  clearStains,
  setStainSlot,
  STAIN_SLOT_COUNT,
  stains,
} from "@workspace/game-v2/mechanics/mage/stains"

const fresh = () => stains.initialState()

describe("Stains", () => {
  it("starts with four empty slots and emits no effect (display-only)", () => {
    expect(fresh().tokens).toEqual([null, null, null, null])
    expect(stains.effects).toBeUndefined()
  })

  it("setStainSlot adds, replaces, and removes a single slot", () => {
    const added = setStainSlot(fresh(), 0, "fire")
    expect(added.tokens).toEqual(["fire", null, null, null])
    const replaced = setStainSlot(added, 0, "ice")
    expect(replaced.tokens).toEqual(["ice", null, null, null])
    const removed = setStainSlot(replaced, 0, null)
    expect(removed.tokens).toEqual([null, null, null, null])
  })

  it("an out-of-range slot index is a no-op (same ref)", () => {
    const state = fresh()
    expect(setStainSlot(state, -1, "fire")).toBe(state)
    expect(setStainSlot(state, STAIN_SLOT_COUNT, "fire")).toBe(state)
  })

  it("setStainSlot is pure (copies the tokens array)", () => {
    const state = fresh()
    const next = setStainSlot(state, 1, "elec")
    expect(state.tokens).toEqual([null, null, null, null])
    expect(next.tokens).not.toBe(state.tokens)
  })

  it("clearStains empties every slot", () => {
    const full = (["fire", "ice", "elec", "wind"] as const).reduce(
      (state, element, slot) => setStainSlot(state, slot, element),
      fresh()
    )
    expect(full.tokens).toEqual(["fire", "ice", "elec", "wind"])
    expect(clearStains(full).tokens).toEqual([null, null, null, null])
  })
})
