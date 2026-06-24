import { describe, expect, it } from "vitest"

import {
  adjustPerfection,
  attackBonusForRank,
  perfection,
  PERFECTION_MAX_RANK,
  PERFECTION_RANK_LABELS,
  rankLabel,
  resetPerfection,
} from "@workspace/game-v2/mechanics/warrior/perfection"

const at = (rank: number) => ({ kind: "perfection", rank }) as const

describe("Perfection", () => {
  it("starts at rank 0 (D)", () => {
    expect(perfection.initialState()).toEqual({ kind: "perfection", rank: 0 })
  })

  it("adjustPerfection clamps to 0..MAX", () => {
    expect(adjustPerfection(at(0), -1).rank).toBe(0)
    expect(adjustPerfection(at(PERFECTION_MAX_RANK), 1).rank).toBe(
      PERFECTION_MAX_RANK
    )
    expect(adjustPerfection(at(2), 1).rank).toBe(3)
  })

  it("resetPerfection drops any rank to 0", () => {
    expect(resetPerfection(at(PERFECTION_MAX_RANK)).rank).toBe(0)
  })

  it("rankLabel / attackBonusForRank map by index and fall back at the edges", () => {
    expect(PERFECTION_RANK_LABELS).toEqual(["D", "C", "B", "A", "S"])
    expect(rankLabel(0)).toBe("D")
    expect(rankLabel(4)).toBe("S")
    expect(rankLabel(99)).toBe("D")
    expect(attackBonusForRank(0)).toBe(0)
    expect(attackBonusForRank(4)).toBe(4)
    expect(attackBonusForRank(99)).toBe(0)
  })

  it("emits no effect at rank 0, an attack-roll bonus above it", () => {
    expect(perfection.effects?.(at(0))).toEqual([])
    expect(perfection.effects?.(at(3))).toEqual([
      { type: "attackRoll", amount: 3, source: "Perfection (A)" },
    ])
  })

  it("is a pure transition (does not mutate input)", () => {
    const state = at(2)
    adjustPerfection(state, 1)
    expect(state.rank).toBe(2)
  })
})
