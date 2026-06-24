import { describe, expect, it } from "vitest"

import { emptyBonusPool } from "@workspace/game-v2/kernel/bonus-pool"
import { computeMaxHP, computeMaxSP } from "@workspace/game-v2/vitals/derive"

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
