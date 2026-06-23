import { describe, expect, it } from "vitest"

import { getExhaustionLevel } from "@workspace/game-v2/resources/exhaustion-table"
import { applyUsePrisma } from "@workspace/game-v2/resources/operations"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"

const resources = (prismaUsed: number): Resources => ({
  hitDiceUsed: 0,
  skillDiceUsed: 0,
  prismaUsed,
})

describe("applyUsePrisma — partial (refuses an empty flask, D26)", () => {
  it("increments prismaUsed while charges remain", () => {
    expect(applyUsePrisma(resources(0), 2)).toEqual({
      ok: true,
      value: { prismaUsed: 1 },
    })
  })

  it("refuses once prismaUsed has reached the max", () => {
    expect(applyUsePrisma(resources(2), 2)).toEqual({
      ok: false,
      error: "no-prisma-charges",
    })
  })

  it("refuses past the max too (a tampered over-spend can't proceed)", () => {
    expect(applyUsePrisma(resources(3), 2)).toEqual({
      ok: false,
      error: "no-prisma-charges",
    })
  })
})

describe("getExhaustionLevel — table lookup with clamp/truncate", () => {
  it("returns the entry for an in-range level", () => {
    expect(getExhaustionLevel(0).description).toBe("No effects.")
    expect(getExhaustionLevel(3).level).toBe(3)
  })

  it("clamps below 0 up to 0 and above 6 down to 6", () => {
    expect(getExhaustionLevel(-2).level).toBe(0)
    expect(getExhaustionLevel(99).level).toBe(6)
  })

  it("truncates a fractional level toward 0", () => {
    expect(getExhaustionLevel(2.9).level).toBe(2)
  })
})
