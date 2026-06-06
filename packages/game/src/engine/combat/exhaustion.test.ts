import { describe, expect, it } from "vitest"

import {
  EXHAUSTION_LEVEL_ENTRIES,
  getExhaustionLevel,
  MAX_EXHAUSTION_LEVEL,
} from "@workspace/game/engine/combat/exhaustion"

describe("getExhaustionLevel", () => {
  it("returns the entry for an in-range level", () => {
    expect(getExhaustionLevel(0).level).toBe(0)
    expect(getExhaustionLevel(3).level).toBe(3)
    expect(getExhaustionLevel(MAX_EXHAUSTION_LEVEL).level).toBe(
      MAX_EXHAUSTION_LEVEL
    )
  })

  it("clamps a level below zero up to zero", () => {
    expect(getExhaustionLevel(-2).level).toBe(0)
  })

  it("clamps a level above the maximum down to the maximum", () => {
    expect(getExhaustionLevel(MAX_EXHAUSTION_LEVEL + 5).level).toBe(
      MAX_EXHAUSTION_LEVEL
    )
  })

  it("truncates a fractional level toward zero before lookup", () => {
    expect(getExhaustionLevel(2.9).level).toBe(2)
  })

  it("returns a non-empty description for every level", () => {
    for (const entry of EXHAUSTION_LEVEL_ENTRIES) {
      expect(
        getExhaustionLevel(entry.level).description.length
      ).toBeGreaterThan(0)
    }
  })
})
