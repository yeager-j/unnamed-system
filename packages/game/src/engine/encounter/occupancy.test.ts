import { describe, expect, it } from "vitest"

import { makeMapInstanceState } from "@workspace/game/engine/__fixtures__/encounter"
import {
  addOccupant,
  removeOccupant,
} from "@workspace/game/engine/encounter/occupancy"

describe("addOccupant", () => {
  it("places a token keyed by combatant id", () => {
    const next = addOccupant(makeMapInstanceState(), "a", {
      zoneId: "z1",
      engagement: { status: "free" },
    })
    expect(next.occupancy).toEqual({
      a: { zoneId: "z1", engagement: { status: "free" } },
    })
  })

  it("replaces an existing token, leaving others untouched", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: { zoneId: "z1", engagement: { status: "free" } },
        b: { zoneId: "z1", engagement: { status: "free" } },
      },
    })
    const next = addOccupant(state, "a", {
      zoneId: "z2",
      engagement: { status: "free" },
    })
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
      occupancy: {
        a: { zoneId: "z1", engagement: { status: "free" } },
        b: { zoneId: "z1", engagement: { status: "free" } },
      },
    })
    const next = removeOccupant(state, "a")
    expect(Object.keys(next.occupancy)).toEqual(["b"])
  })

  it("severs the removed id from a survivor's engagement (symmetric)", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: {
          zoneId: "z1",
          engagement: { status: "engaged", targetCombatantIds: ["b"] },
        },
        b: {
          zoneId: "z1",
          engagement: { status: "engaged", targetCombatantIds: ["a"] },
        },
      },
    })
    const next = removeOccupant(state, "a")
    expect(next.occupancy.a).toBeUndefined()
    expect(next.occupancy.b!.engagement).toEqual({ status: "free" })
  })

  it("drops only the removed id, keeping a survivor's other engagements", () => {
    const state = makeMapInstanceState({
      occupancy: {
        a: {
          zoneId: "z1",
          engagement: { status: "engaged", targetCombatantIds: ["b"] },
        },
        b: {
          zoneId: "z1",
          engagement: { status: "engaged", targetCombatantIds: ["a", "c"] },
        },
        c: {
          zoneId: "z1",
          engagement: { status: "engaged", targetCombatantIds: ["b"] },
        },
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
        a: { zoneId: "z1", engagement: { status: "free" } },
        b: {
          zoneId: "z2",
          engagement: { status: "engaged", targetCombatantIds: ["c"] },
        },
        c: {
          zoneId: "z2",
          engagement: { status: "engaged", targetCombatantIds: ["b"] },
        },
      },
    })
    const next = removeOccupant(state, "a")
    expect(next.occupancy.b!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c"],
    })
  })
})
