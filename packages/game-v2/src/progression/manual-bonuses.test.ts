import { describe, expect, it } from "vitest"

import { emptyBonusPool } from "@workspace/game-v2/kernel/bonus-pool"
import { manualBonusPool } from "@workspace/game-v2/progression/manual-bonuses"

describe("manualBonusPool", () => {
  it("treats absent keys as zero (sparse)", () => {
    expect(manualBonusPool({ strength: 3, hp: 5 })).toEqual({
      ...emptyBonusPool(),
      strength: 3,
      hp: 5,
    })
  })
})
