import { describe, expect, it } from "vitest"

import { emptyBonusPool } from "@workspace/game-v2/kernel/bonus-pool"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"
import {
  computeMaxHP,
  computeMaxSP,
  getPathDice,
  getPathStats,
} from "@workspace/game-v2/vitals/derive"

describe("computeMaxHP / computeMaxSP (base + path/level layer + bonus, D37)", () => {
  const noBonus = emptyBonusPool()

  it("a PC folds base 0 + the path/level formula + the HP/SP bonus", () => {
    expect(
      computeMaxHP(
        { value: 5 },
        { choice: "health-focused" },
        { base: 0 },
        { ...noBonus, hp: 3 }
      )
    ).toBe(24 + 4 * 7 + 3) // 55
    expect(
      computeMaxSP(
        { value: 10 },
        { choice: "skill-focused" },
        { base: 0 },
        noBonus
      )
    ).toBe(60 + 9 * 13) // 177
  })

  it("an enemy (Level but no Path) or shapechanged entity folds its authored base + bonuses, no path layer", () => {
    // A Level without a Path adds no path layer — the authored base stands.
    expect(
      computeMaxHP(
        { value: 8 },
        undefined,
        { base: 100 },
        { ...noBonus, hp: 10 }
      )
    ).toBe(110)
    expect(computeMaxSP(undefined, undefined, { base: 30 }, noBonus)).toBe(30)
  })
})

describe("getPathStats / getPathDice (display reads off the PATH_STATS table)", () => {
  it("returns each path's published starting + per-level HP/SP (rulebook 1.1)", () => {
    expect(getPathStats("health-focused")).toEqual({
      startHP: 24,
      startSP: 40,
      hpPerLevel: 7,
      spPerLevel: 9,
    })
    expect(getPathStats("balanced")).toEqual({
      startHP: 20,
      startSP: 50,
      hpPerLevel: 6,
      spPerLevel: 11,
    })
    expect(getPathStats("skill-focused")).toEqual({
      startHP: 16,
      startSP: 60,
      hpPerLevel: 5,
      spPerLevel: 13,
    })
  })

  it("returns each path's Hit/Skill Die sizes (rulebook 1.1)", () => {
    expect(getPathDice("health-focused")).toEqual({ hitDie: 12, skillDie: 8 })
    expect(getPathDice("balanced")).toEqual({ hitDie: 10, skillDie: 10 })
    expect(getPathDice("skill-focused")).toEqual({ hitDie: 8, skillDie: 12 })
  })

  it("agrees with the maxHP formula it shares a table with (base 0, level 1 = startHP)", () => {
    const paths: PathChoice[] = ["health-focused", "balanced", "skill-focused"]
    for (const choice of paths) {
      expect(
        computeMaxHP({ value: 1 }, { choice }, { base: 0 }, emptyBonusPool())
      ).toBe(getPathStats(choice).startHP)
    }
  })
})
