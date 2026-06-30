import { describe, expect, it } from "vitest"

import { engaged, free, makeMapInstanceState } from "./__fixtures__/spatial"
import { activeEnchantment, engagementOf, zoneOf } from "./selectors"

describe("spatial selectors (the SpatialReads adapter source, SD8)", () => {
  describe("zoneOf", () => {
    it("returns the token's zone when the key is occupied", () => {
      const state = makeMapInstanceState({ occupancy: { p1: free("z1") } })
      expect(zoneOf(state, "p1")).toBe("z1")
    })

    it("returns undefined for an unplaced / mapless key (the unplaced contract)", () => {
      expect(zoneOf(makeMapInstanceState(), "ghost")).toBeUndefined()
    })
  })

  describe("activeEnchantment", () => {
    it("returns the singleton when one is active", () => {
      const enchantment = { zoneId: "z1", type: "toccata", forte: 2 } as const
      const state = makeMapInstanceState({ enchantment })
      expect(activeEnchantment(state)).toBe(enchantment)
    })

    it("returns null when no zone is enchanted", () => {
      expect(activeEnchantment(makeMapInstanceState())).toBeNull()
    })
  })

  describe("engagementOf", () => {
    it("returns the token's engagement when engaged", () => {
      const state = makeMapInstanceState({
        occupancy: { p1: engaged("z1", ["p2"]) },
      })
      expect(engagementOf(state, "p1")).toEqual({
        status: "engaged",
        targetCombatantIds: ["p2"],
      })
    })

    it("reads free for an absent key (structurally un-engaged, CD17)", () => {
      expect(engagementOf(makeMapInstanceState(), "ghost")).toEqual({
        status: "free",
      })
    })
  })
})
