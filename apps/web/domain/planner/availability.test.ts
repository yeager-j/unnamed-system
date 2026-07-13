import { describe, expect, it } from "vitest"

import { availabilityFold } from "@/domain/planner/availability"

describe("availabilityFold (D8 — union of origin + bond lanes)", () => {
  it("returns an empty gate for empty inputs", () => {
    expect(
      availabilityFold({ originLineage: null, storyTier: 1, npcs: [] }).size
    ).toBe(0)
  })

  it("opens each NPC-held Lineage at its bond tier", () => {
    const gate = availabilityFold({
      originLineage: null,
      storyTier: 1,
      npcs: [
        { lineageKey: "thief", bondTier: 2 },
        { lineageKey: "mage", bondTier: 4 },
      ],
    })
    expect(gate.get("thief")).toBe(2)
    expect(gate.get("mage")).toBe(4)
  })

  it("omits zero entries (tier-0 bond is the locked default)", () => {
    const gate = availabilityFold({
      originLineage: null,
      storyTier: 1,
      npcs: [{ lineageKey: "thief", bondTier: 0 }],
    })
    expect(gate.has("thief")).toBe(false)
  })

  it("opens the origin at the story tier", () => {
    const gate = availabilityFold({
      originLineage: "warrior",
      storyTier: 3,
      npcs: [],
    })
    expect(gate.get("warrior")).toBe(3)
  })

  it("union, never min — D8's mid-campaign-joiner fairness example", () => {
    // Party at story 2; Maren (Stormcaller) at bond 4. A joiner whose Origin
    // is Stormcaller gets Stormcaller@4 — what every veteran already has.
    const gate = availabilityFold({
      originLineage: "warlock",
      storyTier: 2,
      npcs: [{ lineageKey: "warlock", bondTier: 4 }],
    })
    expect(gate.get("warlock")).toBe(4)
  })

  it("origin lane wins over a weaker bond on the same Lineage", () => {
    const gate = availabilityFold({
      originLineage: "warlock",
      storyTier: 3,
      npcs: [{ lineageKey: "warlock", bondTier: 1 }],
    })
    expect(gate.get("warlock")).toBe(3)
  })

  it("pre-clock (storyTier 1): origin opens at Initiate only", () => {
    const gate = availabilityFold({
      originLineage: "warrior",
      storyTier: 1,
      npcs: [],
    })
    expect(gate.get("warrior")).toBe(1)
  })

  it("null origin contributes no origin lane", () => {
    const gate = availabilityFold({
      originLineage: null,
      storyTier: 4,
      npcs: [{ lineageKey: "mage", bondTier: 1 }],
    })
    expect([...gate.keys()]).toEqual(["mage"])
  })
})
