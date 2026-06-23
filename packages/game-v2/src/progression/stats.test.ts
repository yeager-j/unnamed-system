import { describe, expect, it } from "vitest"

import type { Mastery } from "@workspace/game-v2/archetypes"
import type { AffinityEffect } from "@workspace/game-v2/kernel"
import {
  baseAffinities,
  baseAttributes,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxSkillDice,
  emptyBonusPool,
  manualBonusPool,
  masteryBonuses,
  pathMaxHP,
  pathMaxSP,
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
})

describe("path HP/SP layer (PATH_STATS, levelsGained)", () => {
  it("is the formula only — no base, no bonuses (resolve adds those, D37)", () => {
    expect(pathMaxHP("balanced", 1)).toBe(20) // start, no per-level gain
    expect(pathMaxSP("balanced", 1)).toBe(50)
    expect(pathMaxHP("health-focused", 5)).toBe(24 + 4 * 7) // 52
    expect(pathMaxSP("skill-focused", 10)).toBe(60 + 9 * 13) // 177
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

  it("baseAffinities fills every damage type, all-neutral when no chart", () => {
    const chart = baseAffinities(undefined)
    expect(chart.fire).toBe("neutral")
    expect(chart.almighty).toBe("neutral")
    expect(Object.keys(chart)).toHaveLength(12)
  })

  describe("computeAffinityChart (override → strongest → base)", () => {
    const base = baseAffinities({ fire: "weak", ice: "resist" })

    it("falls back to base when no candidate or override", () => {
      expect(computeAffinityChart(base, []).fire).toBe("weak")
    })

    it("a granted candidate replaces the base", () => {
      const candidate: AffinityEffect = {
        type: "affinity",
        damageTypes: ["fire"],
        affinity: "resist",
      }
      expect(computeAffinityChart(base, [candidate]).fire).toBe("resist")
    })

    it("picks the strongest candidate by priority (drain > repel > … > weak)", () => {
      const candidates: AffinityEffect[] = [
        { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
        { type: "affinity", damageTypes: ["fire"], affinity: "drain" },
        { type: "affinity", damageTypes: ["fire"], affinity: "null" },
      ]
      expect(computeAffinityChart(base, candidates).fire).toBe("drain")
    })

    it("an override beats every candidate, even Drain", () => {
      const candidate: AffinityEffect = {
        type: "affinity",
        damageTypes: ["fire"],
        affinity: "drain",
      }
      expect(
        computeAffinityChart(base, [candidate], { fire: "weak" }).fire
      ).toBe("weak")
    })
  })
})

describe("baseAttributes", () => {
  it("uses the archetype scores, or zeros when none", () => {
    expect(
      baseAttributes({ strength: 3, magic: 1, agility: 0, luck: -1 })
    ).toEqual({
      strength: 3,
      magic: 1,
      agility: 0,
      luck: -1,
    })
    expect(baseAttributes(undefined)).toEqual({
      strength: 0,
      magic: 0,
      agility: 0,
      luck: 0,
    })
  })
})
