import { describe, expect, it } from "vitest"

import { engaged, free, makeMapInstanceState } from "./__fixtures__/spatial"
import { addOccupant, pruneCombat, removeOccupant } from "./occupancy"

describe("addOccupant", () => {
  it("places a token keyed by tokenKey", () => {
    const next = addOccupant(makeMapInstanceState(), "a", free("z1"))
    expect(next.occupancy).toEqual({
      a: { zoneId: "z1", engagement: { status: "free" } },
    })
  })

  it("replaces an existing token, leaving others untouched", () => {
    const state = makeMapInstanceState({
      occupancy: { a: free("z1"), b: free("z1") },
    })
    const next = addOccupant(state, "a", free("z2"))
    expect(next.occupancy.a!.zoneId).toBe("z2")
    expect(next.occupancy.b).toEqual({
      zoneId: "z1",
      engagement: { status: "free" },
    })
  })
})

describe("removeOccupant", () => {
  it("drops the combatant's token", () => {
    const state = makeMapInstanceState({
      occupancy: { a: free("z1"), b: free("z1") },
    })
    const next = removeOccupant(state, "a")
    expect(Object.keys(next.occupancy)).toEqual(["b"])
  })

  it("severs the removed id from a survivor's engagement (symmetric)", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: engaged("z1", ["b"]),
        b: engaged("z1", ["a"]),
      },
    })
    const next = removeOccupant(state, "a")
    expect(next.occupancy.a).toBeUndefined()
    expect(next.occupancy.b!.engagement).toEqual({ status: "free" })
  })

  it("drops only the removed id, keeping a survivor's other engagements", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: engaged("z1", ["b"]),
        b: engaged("z1", ["a", "c"]),
        c: engaged("z1", ["b"]),
      },
    })
    const next = removeOccupant(state, "a")
    expect(next.occupancy.b!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c"],
    })
    expect(next.occupancy.c!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["b"],
    })
  })

  it("leaves unrelated tokens untouched when removing an unengaged combatant", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: free("z1"),
        b: engaged("z2", ["c"]),
        c: engaged("z2", ["b"]),
      },
    })
    const next = removeOccupant(state, "a")
    expect(next.occupancy.b!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c"],
    })
  })
})

describe("pruneCombat", () => {
  it("drops the named tokens, frees survivors, and clears the enchantment", () => {
    const state = makeMapInstanceState({
      occupancy: {
        pc1: engaged("z2", ["e1"]),
        pc2: engaged("z3", ["e1", "e2"]),
        e1: engaged("z2", ["pc1", "pc2"]),
        e2: engaged("z3", ["pc2"]),
      },
      enchantment: { zoneId: "z2", type: "toccata", forte: 2 },
    })

    const next = pruneCombat(state, ["e1", "e2"])

    expect(Object.keys(next.occupancy).sort()).toEqual(["pc1", "pc2"])
    expect(next.occupancy.pc1!.zoneId).toBe("z2")
    expect(next.occupancy.pc2!.zoneId).toBe("z3")
    expect(next.occupancy.pc1!.engagement).toEqual({ status: "free" })
    expect(next.occupancy.pc2!.engagement).toEqual({ status: "free" })
    expect(next.enchantment).toBeNull()
  })

  it("is a clean no-op shape when there is nothing to prune", () => {
    const state = makeMapInstanceState({
      occupancy: { pc1: free("z1") },
    })
    const next = pruneCombat(state, [])
    expect(next.occupancy).toEqual({
      pc1: { zoneId: "z1", engagement: { status: "free" } },
    })
    expect(next.enchantment).toBeNull()
  })
})
