import { describe, expect, it } from "vitest"

import type { StatComputationCharacter } from "../../character/stats/stats"
import {
  attackBonusForRank,
  perfection,
  PERFECTION_ATTACK_BONUSES,
  PERFECTION_RANK_LABELS,
  rankLabel,
} from "./perfection"

const baseStats: StatComputationCharacter = {
  pathChoice: "balanced",
  level: 1,
  manualBonuses: {},
  activeArchetypeKey: "warrior",
  archetypes: [{ key: "warrior", rank: 1 }],
  equippedItems: [],
  activeSkills: [],
  activeMechanic: null,
}

describe("perfection", () => {
  it("starts at rank D (0)", () => {
    expect(perfection.initialState()).toEqual({ kind: "perfection", rank: 0 })
  })

  it("labels every rank in order D → S", () => {
    expect(PERFECTION_RANK_LABELS).toEqual(["D", "C", "B", "A", "S"])
    expect(rankLabel(0)).toBe("D")
    expect(rankLabel(4)).toBe("S")
  })

  it("scales the Attack bonus 0/1/2/3/4 across ranks D–S", () => {
    expect(PERFECTION_ATTACK_BONUSES).toEqual([0, 1, 2, 3, 4])
    for (let rank = 0 as 0 | 1 | 2 | 3 | 4; rank <= 4; rank++) {
      expect(attackBonusForRank(rank)).toBe(rank)
    }
  })

  it("emits no Effect at rank D", () => {
    expect(
      perfection.effects?.(
        { kind: "perfection", rank: 0 },
        { stats: baseStats }
      )
    ).toEqual([])
  })

  it("emits a +N attackRoll Effect with a labelled source above D", () => {
    const effects = perfection.effects?.(
      { kind: "perfection", rank: 2 },
      { stats: baseStats }
    )
    expect(effects).toEqual([
      { type: "attackRoll", amount: 2, source: "Perfection (B)" },
    ])
  })

  it("emits +4 at rank S", () => {
    const effects = perfection.effects?.(
      { kind: "perfection", rank: 4 },
      { stats: baseStats }
    )
    expect(effects?.[0]).toMatchObject({ amount: 4, source: "Perfection (S)" })
  })
})
