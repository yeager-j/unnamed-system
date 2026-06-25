import { describe, expect, it } from "vitest"

import { makePassiveSkill } from "@workspace/game-v2/items/__fixtures__/catalog"
import {
  applyCast,
  canAfford,
  canCast,
  resolveCost,
  resolveSkillCost,
  type CastPools,
} from "@workspace/game-v2/skills/cost"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const spSkill = (amount: number): Skill => ({
  kind: "support",
  key: "buff",
  name: "Buff",
  tagline: "t",
  description: "d",
  isSynthesis: false,
  cost: { kind: "sp", amount },
  range: { kind: "known", value: "engaged" },
})

const hpPercentSkill = (amount: number): Skill => ({
  kind: "heal",
  key: "drain",
  name: "Drain",
  tagline: "t",
  description: "d",
  isSynthesis: false,
  cost: { kind: "hp-percent", amount },
  range: { kind: "known", value: "engaged" },
})

describe("resolveCost / resolveSkillCost", () => {
  it("SP passes through; %HP rounds down with a floor of 1; passive → null", () => {
    expect(resolveCost({ kind: "sp", amount: 5 }, 100)).toEqual({
      kind: "sp",
      amount: 5,
    })
    // 100 * 10 / 100 = 10
    expect(resolveCost({ kind: "hp-percent", amount: 10 }, 100)).toEqual({
      kind: "hp",
      amount: 10,
    })
    // 33 * 10 / 100 = 3.3 → floor 3
    expect(resolveCost({ kind: "hp-percent", amount: 10 }, 33)).toEqual({
      kind: "hp",
      amount: 3,
    })
    // 5 * 10 / 100 = 0.5 → floor 0 → floored up to 1 (never a free cast)
    expect(resolveCost({ kind: "hp-percent", amount: 10 }, 5)).toEqual({
      kind: "hp",
      amount: 1,
    })
    expect(resolveSkillCost(makePassiveSkill(), 100)).toBeNull()
  })
})

describe("canAfford — SP inclusive, HP strict", () => {
  const pools: CastPools = { currentHP: 10, currentSP: 5 }

  it("SP affordable at exactly the cost (>=)", () => {
    expect(canAfford({ kind: "sp", amount: 5 }, pools)).toBe(true)
    expect(canAfford({ kind: "sp", amount: 6 }, pools)).toBe(false)
  })

  it("HP unaffordable when cost EQUALS current HP (>) — never self-Fall", () => {
    expect(canAfford({ kind: "hp", amount: 9 }, pools)).toBe(true)
    expect(canAfford({ kind: "hp", amount: 10 }, pools)).toBe(false)
  })
})

describe("canCast / applyCast", () => {
  const pools: CastPools = { currentHP: 10, currentSP: 5 }

  it("a passive is always castable and casts to a no-op (ok(null))", () => {
    expect(canCast(makePassiveSkill(), 100, pools)).toBe(true)
    expect(applyCast(makePassiveSkill(), 100, pools)).toEqual({
      ok: true,
      value: null,
    })
  })

  it("an affordable SP cast returns the payment; SP may drop to exactly 0", () => {
    expect(applyCast(spSkill(5), 100, pools)).toEqual({
      ok: true,
      value: { pool: "sp", amount: 5 },
    })
  })

  it("an HP cast that would drop HP to exactly 0 errors with NO payment", () => {
    // maxHP 100, 10% → 10 == currentHP → unaffordable
    expect(applyCast(hpPercentSkill(10), 100, pools)).toEqual({
      ok: false,
      error: "insufficient-hp",
    })
  })

  it("an unaffordable SP cast errors", () => {
    expect(applyCast(spSkill(6), 100, pools)).toEqual({
      ok: false,
      error: "insufficient-sp",
    })
  })
})
