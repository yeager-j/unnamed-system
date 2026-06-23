import { describe, expect, it } from "vitest"

import type { Mastery } from "@workspace/game-v2/archetypes"
import type { AffinityEffect } from "@workspace/game-v2/kernel"
import {
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  emptyBonusPool,
  manualBonusPool,
  masteryBonuses,
  resolveAffinity,
  sumBonuses,
} from "@workspace/game-v2/progression/stats"

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

describe("computeMaxHP / computeMaxSP (base + progression layer + bonus, D37)", () => {
  const noBonus = emptyBonusPool()

  it("a PC folds base 0 + the path/level formula + the HP/SP bonus", () => {
    expect(
      computeMaxHP(
        { level: 5, pathChoice: "health-focused" },
        { base: 0 },
        {
          ...noBonus,
          hp: 3,
        }
      )
    ).toBe(24 + 4 * 7 + 3) // 55
    expect(
      computeMaxSP(
        { level: 10, pathChoice: "skill-focused" },
        { base: 0 },
        noBonus
      )
    ).toBe(60 + 9 * 13) // 177
  })

  it("an enemy (no Progression) folds its authored base + bonuses, no path layer", () => {
    expect(computeMaxHP(undefined, { base: 100 }, { ...noBonus, hp: 10 })).toBe(
      110
    )
    expect(computeMaxSP(undefined, { base: 30 }, noBonus)).toBe(30)
  })
})

describe("dice maxima", () => {
  it("maxHitDice = level + 1, maxSkillDice = 2·level + 3", () => {
    expect(computeMaxHitDice(1)).toBe(2)
    expect(computeMaxHitDice(13)).toBe(14)
    expect(computeMaxSkillDice(1)).toBe(5)
    expect(computeMaxSkillDice(13)).toBe(29)
  })
})

describe("masteryBonuses (C4 — applies at rank ≥ 5 even when inactive)", () => {
  const masteryTable: Record<string, Mastery> = {
    str5: { kind: "attribute", amount: 2, attribute: "strength" },
    hp5: { kind: "hp", amount: 20 },
  }
  const masteryOf = (key: string): Mastery | undefined => masteryTable[key]

  it("sums Mastery for every roster archetype at rank ≥ 5, active or not", () => {
    const pool = masteryBonuses(
      [
        { key: "str5", rank: 5 }, // not the active one — still applies (C4)
        { key: "hp5", rank: 6 },
      ],
      masteryOf
    )
    expect(pool.strength).toBe(2)
    expect(pool.hp).toBe(20)
  })

  it("ignores archetypes below the Mastery rank", () => {
    expect(masteryBonuses([{ key: "str5", rank: 4 }], masteryOf).strength).toBe(
      0
    )
  })

  it("ignores a roster key the catalog doesn't know", () => {
    expect(masteryBonuses([{ key: "ghost", rank: 7 }], masteryOf).hp).toBe(0)
  })
})

describe("manualBonusPool", () => {
  it("treats absent keys as zero (sparse)", () => {
    expect(manualBonusPool({ strength: 3, hp: 5 })).toEqual({
      ...emptyBonusPool(),
      strength: 3,
      hp: 5,
    })
  })
})

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

describe("affinity resolution", () => {
  it("resolveAffinity: absent ⇒ neutral; Almighty always neutral", () => {
    expect(resolveAffinity({ fire: "weak" }, "fire")).toBe("weak")
    expect(resolveAffinity({ fire: "weak" }, "ice")).toBe("neutral")
    expect(resolveAffinity({ fire: "weak" }, "almighty")).toBe("neutral")
  })

  describe("computeAffinityChart (override → strongest → archetype → base)", () => {
    const base = { fire: "weak", ice: "resist" } as const

    it("fills every damage type, Almighty/uncharted Neutral", () => {
      const chart = computeAffinityChart({}, undefined, [])
      expect(chart.fire).toBe("neutral")
      expect(chart.almighty).toBe("neutral")
      expect(Object.keys(chart)).toHaveLength(12)
    })

    it("falls back to the entity base when no layer/candidate/override", () => {
      expect(computeAffinityChart(base, undefined, []).fire).toBe("weak")
    })

    it("the archetype layer overrides the entity base per charted type", () => {
      expect(computeAffinityChart(base, { fire: "resist" }, []).fire).toBe(
        "resist"
      )
    })

    it("a granted candidate replaces the base", () => {
      const candidate: AffinityEffect = {
        type: "affinity",
        damageTypes: ["fire"],
        affinity: "resist",
      }
      expect(computeAffinityChart(base, undefined, [candidate]).fire).toBe(
        "resist"
      )
    })

    it("picks the strongest candidate by priority (drain > repel > … > weak)", () => {
      const candidates: AffinityEffect[] = [
        { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
        { type: "affinity", damageTypes: ["fire"], affinity: "drain" },
        { type: "affinity", damageTypes: ["fire"], affinity: "null" },
      ]
      expect(computeAffinityChart(base, undefined, candidates).fire).toBe(
        "drain"
      )
    })

    it("an override beats every candidate and layer, even Drain", () => {
      const candidate: AffinityEffect = {
        type: "affinity",
        damageTypes: ["fire"],
        affinity: "drain",
      }
      expect(
        computeAffinityChart(base, undefined, [candidate], { fire: "weak" })
          .fire
      ).toBe("weak")
    })
  })
})
