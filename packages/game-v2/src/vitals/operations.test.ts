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
import { ok } from "@workspace/result"

/**
 * Unit tests for the signed-depletion pool operations (UNN-501, D9/D10). The
 * resolved current value is `max(0, max − used)`; these assert the *stored* patch
 * each operation returns (in an `ok` {@link Result} since UNN-565), which the
 * resolve fold then derives current from.
 */

const vitals = (damage: number): Vitals => ({ base: 0, damage })
const skillPool = (spSpent: number): SkillPool => ({ base: 0, spSpent })

/** The malformed amounts every op rejects: fractional, `NaN`, `Infinity`. */
const NON_INTEGERS = [1.5, -0.5, NaN, Infinity, -Infinity]

describe("applyDamage — signed, unclamped (D10)", () => {
  it("adds positive damage", () => {
    expect(applyDamage(vitals(10), 25)).toEqual(ok({ damage: 35 }))
  })

  it("drives damage negative for an over-max grant (the Usury loan)", () => {
    // 90/100 (damage 10) + a 25 loan ⇒ damage −15 ⇒ 115/100. A negative amount is
    // legal here — applyDamage's amount is a signed delta (monoid over ℤ).
    expect(applyDamage(vitals(10), -25)).toEqual(ok({ damage: -15 }))
  })

  it("preserves true overkill magnitude past maxHP (current floors at 0 in resolve)", () => {
    expect(applyDamage(vitals(80), 50)).toEqual(ok({ damage: 130 }))
  })

  it("rejects a non-integer amount but accepts any integer (signed)", () => {
    for (const amount of NON_INTEGERS) {
      expect(applyDamage(vitals(10), amount)).toEqual({
        ok: false,
        error: "invalid-input",
      })
    }
    // A negative integer is NOT malformed for this op.
    expect(applyDamage(vitals(10), -3).ok).toBe(true)
  })
})

describe("applyHeal — reduce damage, floor at 0, never reduce current HP", () => {
  it("heals down toward 0", () => {
    expect(applyHeal(vitals(30), 10)).toEqual(ok({ damage: 20 }))
  })

  it("floors at 0 — no overheal above maxHP", () => {
    expect(applyHeal(vitals(5), 20)).toEqual(ok({ damage: 0 }))
  })

  it("revives a Fallen entity (damage above maxHP) below maxHP", () => {
    // maxHP 100, damage 100 (Fallen) + heal 40 ⇒ damage 60 ⇒ 40/100, no longer Fallen.
    const patch = applyHeal(vitals(100), 40)
    expect(patch).toEqual(ok({ damage: 60 }))
    if (!patch.ok) throw new Error("expected ok")
    expect(isFallen({ maxHP: 100, currentHP: 100 - patch.value.damage })).toBe(
      false
    )
  })

  it("is a no-op when already over-max — does NOT wipe 115/100 to 100/100", () => {
    // damage −15 (115/100); any heal must leave the over-max balance untouched.
    expect(applyHeal(vitals(-15), 50)).toEqual(ok({ damage: -15 }))
  })

  it("rejects a non-non-negative-integer amount (magnitude)", () => {
    for (const amount of [...NON_INTEGERS, -3]) {
      expect(applyHeal(vitals(10), amount)).toEqual({
        ok: false,
        error: "invalid-input",
      })
    }
  })
})

describe("applySpendSP / applyRecoverSP", () => {
  it("spend adds to spSpent (over-spend floors current at 0 in resolve)", () => {
    expect(applySpendSP(skillPool(10), 25)).toEqual(ok({ spSpent: 35 }))
    expect(applySpendSP(skillPool(20), 50)).toEqual(ok({ spSpent: 70 }))
  })

  it("recover reduces spSpent, floored at 0 — no over-recovery", () => {
    expect(applyRecoverSP(skillPool(30), 10)).toEqual(ok({ spSpent: 20 }))
    expect(applyRecoverSP(skillPool(5), 20)).toEqual(ok({ spSpent: 0 }))
  })

  it("both reject a non-non-negative-integer amount (magnitudes)", () => {
    for (const amount of [...NON_INTEGERS, -3]) {
      expect(applySpendSP(skillPool(10), amount)).toEqual({
        ok: false,
        error: "invalid-input",
      })
      expect(applyRecoverSP(skillPool(10), amount)).toEqual({
        ok: false,
        error: "invalid-input",
      })
    }
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
