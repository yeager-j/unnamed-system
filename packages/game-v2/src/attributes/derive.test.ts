import { describe, expect, it } from "vitest"

import { computeAttributes } from "@workspace/game-v2/attributes/derive"
import { emptyBonusPool } from "@workspace/game-v2/kernel/bonus-pool"

describe("computeAttributes (sum-then-clamp, C1)", () => {
  it("sums every source (base + archetype layer + pool) then clamps to [-7, +7]", () => {
    const base = { strength: 4, magic: -5, agility: 0, luck: 2 }
    const archetype = { strength: 1, magic: -1, agility: 0, luck: 0 }
    const pool = { ...emptyBonusPool(), strength: 4, magic: -3, luck: 1 }
    expect(computeAttributes(base, archetype, pool)).toEqual({
      strength: 7, // 4+1+4 = 9 → clamp 7
      magic: -7, // -5-1-3 = -9 → clamp -7
      agility: 0,
      luck: 3,
    })
  })

  it("clamps AFTER summing, not per source (a +max source with a negative source lands in range)", () => {
    const base = { strength: 7, magic: 0, agility: 0, luck: 0 }
    const pool = { ...emptyBonusPool(), strength: -3 }
    // Per-source clamping would also give 4 here, but the +9→7 case above is what
    // pins the sum-then-clamp contract down.
    expect(computeAttributes(base, pool).strength).toBe(4)
  })

  it("treats an absent (undefined) source as zero — the no-archetype layer case", () => {
    const base = { strength: 2, magic: 1, agility: 0, luck: 0 }
    const pool = { ...emptyBonusPool(), magic: 3 }
    expect(computeAttributes(base, undefined, pool)).toEqual({
      strength: 2,
      magic: 4,
      agility: 0,
      luck: 0,
    })
  })
})
