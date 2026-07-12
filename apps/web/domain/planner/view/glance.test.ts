import { describe, expect, it } from "vitest"

import { buildRosterGlance } from "./glance"

const TALENT_ROSTER = {
  entries: [
    { key: "perform", label: "Perform", inherited: true },
    { key: "persuade", label: "Persuade", inherited: false },
  ],
  learnable: [],
}

describe("buildRosterGlance", () => {
  it("folds sparks, virtue ranks, and talent labels", () => {
    const glance = buildRosterGlance({
      virtues: {
        ranks: { expression: 3, empathy: 1, wisdom: 0, focus: 2 },
        sparkLog: ["expression", "focus", "expression"],
      },
      talentRoster: TALENT_ROSTER,
    })

    expect(glance.sparks).toEqual({ current: 3, capacity: 7 })
    expect(glance.virtues).toEqual([
      { key: "expression", label: "Expression", rank: 3, max: 7 },
      { key: "empathy", label: "Empathy", rank: 1, max: 7 },
      { key: "wisdom", label: "Wisdom", rank: 0, max: 7 },
      { key: "focus", label: "Focus", rank: 2, max: 7 },
    ])
    expect(glance.talents).toEqual(["Perform", "Persuade"])
  })

  it("reads a missing virtues component as zeroes (defensive)", () => {
    const glance = buildRosterGlance({
      virtues: undefined,
      talentRoster: { entries: [], learnable: [] },
    })
    expect(glance.sparks.current).toBe(0)
    expect(glance.virtues.every((virtue) => virtue.rank === 0)).toBe(true)
    expect(glance.talents).toEqual([])
  })
})
