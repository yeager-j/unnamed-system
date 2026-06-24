import { describe, expect, it } from "vitest"

import {
  emptyBonusPool,
  sumBonuses,
} from "@workspace/game-v2/kernel/bonus-pool"

describe("sumBonuses", () => {
  it("adds pools target-by-target", () => {
    const a = { ...emptyBonusPool(), strength: 2, hp: 1 }
    const b = { ...emptyBonusPool(), strength: 3, sp: 4 }
    expect(sumBonuses(a, b)).toEqual({
      ...emptyBonusPool(),
      strength: 5,
      hp: 1,
      sp: 4,
    })
  })
})
