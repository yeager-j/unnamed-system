import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  healNeverLowersCurrentHP,
  type HealOperation,
} from "@workspace/game-v2/vitals/__laws__/heal-property"
import { applyHeal } from "@workspace/game-v2/vitals/operations"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * **The negative control** — a test of the test.
 *
 * A green property proves nothing unless it can go red. This one aims
 * `healNeverLowersCurrentHP` at a heal whose clamp is deliberately broken (the
 * over-max guard removed, which is the clamp a reviewer would most plausibly
 * "simplify" away) and asserts the property *fails*, with a counterexample that is
 * an over-max heal.
 *
 * The point is the AC's: a property finds this, an example test only finds it if
 * someone already thought to write `applyHeal({ base: 100, damage: -15 }, 50)`.
 * `fc.check` reports rather than throws, so the failure is a value we can inspect.
 */
const brokenHeal: HealOperation = (vitals: Vitals, amount: number) => ({
  damage: Math.max(0, vitals.damage - amount),
})

describe("healNeverLowersCurrentHP", () => {
  it("passes for the real clamp", () => {
    expect(fc.check(healNeverLowersCurrentHP(applyHeal)).failed).toBe(false)
  })

  it("fails for a clamp that wipes over-max HP", () => {
    const result = fc.check(healNeverLowersCurrentHP(brokenHeal))

    expect(result.failed).toBe(true)

    const [vitals] = result.counterexample ?? []
    if (vitals === undefined) {
      throw new Error("a failing property must report a counterexample")
    }
    expect(vitals.damage).toBeLessThan(0)
  })
})
