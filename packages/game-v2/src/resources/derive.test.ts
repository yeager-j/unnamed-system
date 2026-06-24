import { describe, expect, it } from "vitest"

import {
  computeMaxHitDice,
  computeMaxSkillDice,
} from "@workspace/game-v2/resources/derive"

describe("dice maxima", () => {
  it("maxHitDice = level + 1, maxSkillDice = 2·level + 3", () => {
    expect(computeMaxHitDice(1)).toBe(2)
    expect(computeMaxHitDice(13)).toBe(14)
    expect(computeMaxSkillDice(1)).toBe(5)
    expect(computeMaxSkillDice(13)).toBe(29)
  })
})
