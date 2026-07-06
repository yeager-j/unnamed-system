import { describe, expect, it } from "vitest"

import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type RestComponents,
} from "@workspace/game-v2/resources/rest"

/**
 * A case-for-case port of v1 `combat/rest.test.ts`, translated onto the
 * signed-depletion model. v1's default is a Level 1 `balanced` character (max HP
 * 20, max SP 50, max Hit Dice 2, max Skill Dice 5); the transitions here derive
 * only the dice maxima (from `level`), so the stored slice is built directly —
 * no `resolve` needed. The v1 absolute assertions translate as:
 *
 *   currentHP X  → damage = 20 − X        currentSP X          → spSpent = 50 − X
 *   skillDiceRemaining R → skillDiceUsed = 5 − R
 *   hitDiceRemaining R   → hitDiceUsed   = 2 − R
 *
 * and every expectation asserts the returned depletion patch rather than a
 * derived current.
 *
 * v1's two Zod input-schema describe-blocks aren't ported verbatim (that schema
 * lands at the S2a Server Action for form UX), but the non-negative-integer bound
 * they enforced (A8) is not dropped: the client-shipped engine now guards it
 * itself, returning `invalid-input` — the "rejects a negative/fractional amount"
 * cases below cover that boundary in place of the schema tests.
 */
function makeComponents(
  overrides: Partial<RestComponents> = {}
): RestComponents {
  return {
    vitals: { base: 0, damage: 0 },
    skillPool: { base: 0, spSpent: 0 },
    resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
    exhaustion: { level: 0 },
    level: { value: 1 },
    ...overrides,
  }
}

describe("applyFullRest", () => {
  it("restores HP/SP, Hit/Skill Dice, and Prisma to max", () => {
    const patch = applyFullRest(
      makeComponents({
        // v1: currentHP 3, currentSP 7, skillDiceRemaining 1, prismaCharges 0.
        vitals: { base: 0, damage: 17 },
        skillPool: { base: 0, spSpent: 43 },
        resources: { hitDiceUsed: 2, skillDiceUsed: 4, prismaUsed: 3 },
      })
    )

    expect(patch.vitals).toEqual({ damage: 0 })
    expect(patch.skillPool).toEqual({ spSpent: 0 })
    expect(patch.resources).toEqual({
      hitDiceUsed: 0,
      skillDiceUsed: 0,
      prismaUsed: 0,
    })
  })

  it("reduces Exhaustion by one level", () => {
    expect(
      applyFullRest(makeComponents({ exhaustion: { level: 3 } })).exhaustion
    ).toEqual({ level: 2 })
  })

  it("floors Exhaustion at zero", () => {
    expect(
      applyFullRest(makeComponents({ exhaustion: { level: 0 } })).exhaustion
    ).toEqual({ level: 0 })
  })

  it("does not mutate its input", () => {
    const components = makeComponents({
      vitals: { base: 0, damage: 19 },
      exhaustion: { level: 2 },
    })
    const snapshot = structuredClone(components)

    applyFullRest(components)

    expect(components).toEqual(snapshot)
  })
})

describe("applyPartialRest", () => {
  it("restores HP to max, spends Skill Dice, and adds rolled SP", () => {
    // v1: currentHP 4, currentSP 10, skillDiceRemaining 5; spend 3, recover 12.
    const result = applyPartialRest(
      makeComponents({
        vitals: { base: 0, damage: 16 },
        skillPool: { base: 0, spSpent: 40 },
        resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
      }),
      { skillDiceToSpend: 3, rolled: 12 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.vitals).toEqual({ damage: 0 }) // v1 currentHP 20
    expect(result.value.resources).toEqual({ skillDiceUsed: 3 }) // v1 remaining 2
    expect(result.value.skillPool).toEqual({ spSpent: 28 }) // v1 currentSP 22
  })

  it("clamps recovered SP at max SP", () => {
    // v1: currentSP 45, skillDiceRemaining 5; spend 5, recover 99 → currentSP 50.
    const result = applyPartialRest(
      makeComponents({ skillPool: { base: 0, spSpent: 5 } }),
      { skillDiceToSpend: 5, rolled: 99 }
    )

    expect(result.ok && result.value.skillPool).toEqual({ spSpent: 0 })
  })

  it("does not restore Hit Dice or reduce Exhaustion", () => {
    // v1: hitDiceRemaining 1, exhaustion 2, skillDiceRemaining 2; spend 1.
    const result = applyPartialRest(
      makeComponents({
        exhaustion: { level: 2 },
        resources: { hitDiceUsed: 1, skillDiceUsed: 3, prismaUsed: 0 },
      }),
      { skillDiceToSpend: 1, rolled: 0 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.resources?.hitDiceUsed).toBeUndefined()
    expect(result.value.exhaustion).toBeUndefined()
  })

  it("fails when spending more Skill Dice than remaining", () => {
    // v1: skillDiceRemaining 2; spend 3.
    const result = applyPartialRest(
      makeComponents({
        resources: { hitDiceUsed: 0, skillDiceUsed: 3, prismaUsed: 0 },
      }),
      { skillDiceToSpend: 3, rolled: 0 }
    )

    expect(result).toEqual({ ok: false, error: "insufficient-skill-dice" })
  })

  it("rejects a negative Skill Dice spend", () => {
    const result = applyPartialRest(makeComponents(), {
      skillDiceToSpend: -1,
      rolled: 0,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("rejects a fractional Skill Dice spend", () => {
    const result = applyPartialRest(makeComponents(), {
      skillDiceToSpend: 1.5,
      rolled: 0,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("rejects a fractional rolled SP amount", () => {
    const result = applyPartialRest(makeComponents(), {
      skillDiceToSpend: 0,
      rolled: 2.5,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("succeeds when spending exactly the remaining Skill Dice", () => {
    // v1: skillDiceRemaining 2; spend 2.
    const result = applyPartialRest(
      makeComponents({
        resources: { hitDiceUsed: 0, skillDiceUsed: 3, prismaUsed: 0 },
      }),
      { skillDiceToSpend: 2, rolled: 0 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.resources).toEqual({ skillDiceUsed: 5 }) // v1 remaining 0
  })

  it("succeeds on a zero spend with zero remaining", () => {
    // v1: skillDiceRemaining 0; spend 0.
    const result = applyPartialRest(
      makeComponents({
        resources: { hitDiceUsed: 0, skillDiceUsed: 5, prismaUsed: 0 },
      }),
      { skillDiceToSpend: 0, rolled: 0 }
    )

    expect(result.ok).toBe(true)
  })

  it("does not mutate its input", () => {
    const components = makeComponents({
      skillPool: { base: 0, spSpent: 40 },
      resources: { hitDiceUsed: 0, skillDiceUsed: 1, prismaUsed: 0 },
    })
    const snapshot = structuredClone(components)

    applyPartialRest(components, { skillDiceToSpend: 2, rolled: 8 })

    expect(components).toEqual(snapshot)
  })
})

describe("applyRespite", () => {
  it("adds rolled HP and spends Hit Dice", () => {
    // v1: currentHP 8, hitDiceRemaining 3; spend 2, recover 9 → currentHP 17.
    // hitDiceRemaining 3 exceeds L1 max (2), so this case uses L2 (max Hit Dice 3).
    const result = applyRespite(
      makeComponents({
        vitals: { base: 0, damage: 12 },
        level: { value: 2 },
      }),
      { hitDiceToSpend: 2, rolled: 9 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.vitals).toEqual({ damage: 3 }) // v1 currentHP 17
    expect(result.value.resources).toEqual({ hitDiceUsed: 2 }) // v1 remaining 1
  })

  it("clamps recovered HP at max HP", () => {
    // v1: currentHP 18, hitDiceRemaining 2; recover 99 → currentHP 20.
    const result = applyRespite(
      makeComponents({ vitals: { base: 0, damage: 2 } }),
      { hitDiceToSpend: 2, rolled: 99 }
    )

    expect(result.ok && result.value.vitals).toEqual({ damage: 0 })
  })

  it("does not restore SP or reduce Exhaustion", () => {
    // v1: currentSP 5, exhaustion 2, hitDiceRemaining 2; spend 1, recover 3.
    const result = applyRespite(
      makeComponents({
        skillPool: { base: 0, spSpent: 45 },
        exhaustion: { level: 2 },
      }),
      { hitDiceToSpend: 1, rolled: 3 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.skillPool).toBeUndefined()
    expect(result.value.exhaustion).toBeUndefined()
  })

  it("fails when spending more Hit Dice than remaining", () => {
    // v1: hitDiceRemaining 1; spend 2.
    const result = applyRespite(
      makeComponents({
        resources: { hitDiceUsed: 1, skillDiceUsed: 0, prismaUsed: 0 },
      }),
      { hitDiceToSpend: 2, rolled: 0 }
    )

    expect(result).toEqual({ ok: false, error: "insufficient-hit-dice" })
  })

  it("rejects a negative Hit Dice spend", () => {
    const result = applyRespite(makeComponents(), {
      hitDiceToSpend: -1,
      rolled: 0,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("rejects a fractional Hit Dice spend", () => {
    const result = applyRespite(makeComponents(), {
      hitDiceToSpend: 1.5,
      rolled: 0,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("rejects a fractional rolled HP amount", () => {
    const result = applyRespite(makeComponents(), {
      hitDiceToSpend: 0,
      rolled: 3.5,
    })

    expect(result).toStrictEqual({ ok: false, error: "invalid-input" })
  })

  it("succeeds when spending exactly the remaining Hit Dice", () => {
    // v1: hitDiceRemaining 2; spend 2.
    const result = applyRespite(makeComponents(), {
      hitDiceToSpend: 2,
      rolled: 0,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.resources).toEqual({ hitDiceUsed: 2 }) // v1 remaining 0
  })

  it("succeeds on a zero spend with zero remaining", () => {
    // v1: hitDiceRemaining 0; spend 0.
    const result = applyRespite(
      makeComponents({
        resources: { hitDiceUsed: 2, skillDiceUsed: 0, prismaUsed: 0 },
      }),
      { hitDiceToSpend: 0, rolled: 0 }
    )

    expect(result.ok).toBe(true)
  })

  it("does not mutate its input", () => {
    // v1 fixture: currentHP 6, hitDiceRemaining 3 → L2 (max Hit Dice 3).
    const components = makeComponents({
      vitals: { base: 0, damage: 14 },
      level: { value: 2 },
    })
    const snapshot = structuredClone(components)

    applyRespite(components, { hitDiceToSpend: 1, rolled: 5 })

    expect(components).toEqual(snapshot)
  })
})
