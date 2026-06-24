import { describe, expect, it } from "vitest"

import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
  isFallen,
} from "@workspace/game-v2/vitals/operations"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * Unit tests for the signed-depletion pool operations (UNN-501, D9/D10). The
 * resolved current value is `max(0, max − used)`; these assert the *stored* patch
 * each operation returns, which the resolve fold then derives current from.
 */

const vitals = (damage: number): Vitals => ({ base: 0, damage })
const skillPool = (spSpent: number): SkillPool => ({ base: 0, spSpent })

describe("applyDamage — signed, unclamped (D10)", () => {
  it("adds positive damage", () => {
    expect(applyDamage(vitals(10), 25)).toEqual({ damage: 35 })
  })

  it("drives damage negative for an over-max grant (the Usury loan)", () => {
    // 90/100 (damage 10) + a 25 loan ⇒ damage −15 ⇒ 115/100.
    expect(applyDamage(vitals(10), -25)).toEqual({ damage: -15 })
  })

  it("preserves true overkill magnitude past maxHP (current floors at 0 in resolve)", () => {
    expect(applyDamage(vitals(80), 50)).toEqual({ damage: 130 })
  })
})

describe("applyHeal — reduce damage, floor at 0, never reduce current HP", () => {
  it("heals down toward 0", () => {
    expect(applyHeal(vitals(30), 10)).toEqual({ damage: 20 })
  })

  it("floors at 0 — no overheal above maxHP", () => {
    expect(applyHeal(vitals(5), 20)).toEqual({ damage: 0 })
  })

  it("revives a Fallen entity (damage above maxHP) below maxHP", () => {
    // maxHP 100, damage 100 (Fallen) + heal 40 ⇒ damage 60 ⇒ 40/100, no longer Fallen.
    const patch = applyHeal(vitals(100), 40)
    expect(patch).toEqual({ damage: 60 })
    expect(isFallen({ maxHP: 100, currentHP: 100 - patch.damage })).toBe(false)
  })

  it("is a no-op when already over-max — does NOT wipe 115/100 to 100/100", () => {
    // damage −15 (115/100); any heal must leave the over-max balance untouched.
    expect(applyHeal(vitals(-15), 50)).toEqual({ damage: -15 })
  })
})

describe("applySpendSP / applyRecoverSP", () => {
  it("spend adds to spSpent (over-spend floors current at 0 in resolve)", () => {
    expect(applySpendSP(skillPool(10), 25)).toEqual({ spSpent: 35 })
    expect(applySpendSP(skillPool(20), 50)).toEqual({ spSpent: 70 })
  })

  it("recover reduces spSpent, floored at 0 — no over-recovery", () => {
    expect(applyRecoverSP(skillPool(30), 10)).toEqual({ spSpent: 20 })
    expect(applyRecoverSP(skillPool(5), 20)).toEqual({ spSpent: 0 })
  })
})

describe("isFallen (D9, supersedes v1's currentHP <= 0)", () => {
  it("is true at exactly 0 current HP", () => {
    expect(isFallen({ maxHP: 100, currentHP: 0 })).toBe(true)
  })

  it("is false at any positive current HP", () => {
    expect(isFallen({ maxHP: 100, currentHP: 1 })).toBe(false)
  })

  it("is false over-max (currentHP exceeds maxHP)", () => {
    expect(isFallen({ maxHP: 100, currentHP: 115 })).toBe(false)
  })
})
