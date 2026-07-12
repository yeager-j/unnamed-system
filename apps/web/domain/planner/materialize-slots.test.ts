import { describe, expect, it } from "vitest"

import { daysInInterval, planSlotMaterialization } from "./materialize-slots"

const template = [{ label: "Morning" }, { label: "Evening" }]

describe("daysInInterval", () => {
  it("covers (from, to] — the advance window", () => {
    expect(daysInInterval(14, 17)).toEqual([15, 16, 17])
  })

  it("is a single day for a plain advance", () => {
    expect(daysInInterval(14, 15)).toEqual([15])
  })

  it("is empty when to ≤ from", () => {
    expect(daysInInterval(14, 14)).toEqual([])
    expect(daysInInterval(14, 13)).toEqual([])
  })
})

describe("planSlotMaterialization", () => {
  it("plans one row per template entry per day, ordinals in template order", () => {
    expect(planSlotMaterialization(template, [15, 16], new Set())).toEqual([
      { day: 15, ordinal: 0, label: "Morning" },
      { day: 15, ordinal: 1, label: "Evening" },
      { day: 16, ordinal: 0, label: "Morning" },
      { day: 16, ordinal: 1, label: "Evening" },
    ])
  })

  it("skips days that already have slots (template applies forward-only)", () => {
    expect(planSlotMaterialization(template, [15, 16], new Set([15]))).toEqual([
      { day: 16, ordinal: 0, label: "Morning" },
      { day: 16, ordinal: 1, label: "Evening" },
    ])
  })

  it("plans nothing when every day is already materialized", () => {
    expect(
      planSlotMaterialization(template, [15, 16], new Set([15, 16]))
    ).toEqual([])
  })

  it("plans nothing for an empty window", () => {
    expect(planSlotMaterialization(template, [], new Set())).toEqual([])
  })
})
