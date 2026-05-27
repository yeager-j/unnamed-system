import { describe, expect, it } from "vitest"

import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type RestingCharacter,
} from "./rest"

/**
 * Default: a Level 1 `balanced`-path character with no Archetypes, items, or
 * Skills, so the derived maxes reduce to the path base — max HP 20, max SP 50,
 * max Hit Dice 2, max Skill Dice 5 — and every expectation is exact.
 */
function makeCharacter(
  overrides: Partial<RestingCharacter> = {}
): RestingCharacter {
  return {
    pathChoice: "balanced",
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: null,
    archetypes: [],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
    currentHP: 5,
    currentSP: 5,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    exhaustion: 0,
    prismaCharges: 0,
    prismaMaxCharges: 2,
    ...overrides,
  }
}

describe("applyFullRest", () => {
  it("restores HP/SP, Hit/Skill Dice, and Prisma to max", () => {
    const result = applyFullRest(
      makeCharacter({
        currentHP: 3,
        currentSP: 7,
        hitDiceRemaining: 0,
        skillDiceRemaining: 1,
        prismaCharges: 0,
        prismaMaxCharges: 3,
      })
    )

    expect(result.currentHP).toBe(20)
    expect(result.currentSP).toBe(50)
    expect(result.hitDiceRemaining).toBe(2)
    expect(result.skillDiceRemaining).toBe(5)
    expect(result.prismaCharges).toBe(3)
  })

  it("reduces Exhaustion by one level", () => {
    expect(applyFullRest(makeCharacter({ exhaustion: 3 })).exhaustion).toBe(2)
  })

  it("floors Exhaustion at zero", () => {
    expect(applyFullRest(makeCharacter({ exhaustion: 0 })).exhaustion).toBe(0)
  })

  it("does not mutate its input", () => {
    const character = makeCharacter({ currentHP: 1, exhaustion: 2 })
    const snapshot = structuredClone(character)

    applyFullRest(character)

    expect(character).toEqual(snapshot)
  })
})

describe("applyPartialRest", () => {
  it("restores HP to max, spends Skill Dice, and adds rolled SP", () => {
    const result = applyPartialRest(
      makeCharacter({ currentHP: 4, currentSP: 10, skillDiceRemaining: 5 }),
      { skillDiceSpent: 3, spRecovered: 12 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.currentHP).toBe(20)
    expect(result.value.skillDiceRemaining).toBe(2)
    expect(result.value.currentSP).toBe(22)
  })

  it("clamps recovered SP at max SP", () => {
    const result = applyPartialRest(
      makeCharacter({ currentSP: 45, skillDiceRemaining: 5 }),
      { skillDiceSpent: 5, spRecovered: 99 }
    )

    expect(result.ok && result.value.currentSP).toBe(50)
  })

  it("does not restore Hit Dice or reduce Exhaustion", () => {
    const result = applyPartialRest(
      makeCharacter({
        hitDiceRemaining: 1,
        exhaustion: 2,
        skillDiceRemaining: 2,
      }),
      { skillDiceSpent: 1, spRecovered: 0 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.hitDiceRemaining).toBe(1)
    expect(result.value.exhaustion).toBe(2)
  })

  it("fails when spending more Skill Dice than remaining", () => {
    const result = applyPartialRest(makeCharacter({ skillDiceRemaining: 2 }), {
      skillDiceSpent: 3,
      spRecovered: 0,
    })

    expect(result).toEqual({ ok: false, error: "insufficient-skill-dice" })
  })

  it("does not mutate its input", () => {
    const character = makeCharacter({ currentSP: 10, skillDiceRemaining: 4 })
    const snapshot = structuredClone(character)

    applyPartialRest(character, { skillDiceSpent: 2, spRecovered: 8 })

    expect(character).toEqual(snapshot)
  })
})

describe("applyRespite", () => {
  it("adds rolled HP and spends Hit Dice", () => {
    const result = applyRespite(
      makeCharacter({ currentHP: 8, hitDiceRemaining: 3 }),
      { hitDiceSpent: 2, hpRecovered: 9 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.currentHP).toBe(17)
    expect(result.value.hitDiceRemaining).toBe(1)
  })

  it("clamps recovered HP at max HP", () => {
    const result = applyRespite(
      makeCharacter({ currentHP: 18, hitDiceRemaining: 2 }),
      { hitDiceSpent: 2, hpRecovered: 99 }
    )

    expect(result.ok && result.value.currentHP).toBe(20)
  })

  it("does not restore SP or reduce Exhaustion", () => {
    const result = applyRespite(
      makeCharacter({ currentSP: 5, exhaustion: 2, hitDiceRemaining: 2 }),
      { hitDiceSpent: 1, hpRecovered: 3 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.currentSP).toBe(5)
    expect(result.value.exhaustion).toBe(2)
  })

  it("fails when spending more Hit Dice than remaining", () => {
    const result = applyRespite(makeCharacter({ hitDiceRemaining: 1 }), {
      hitDiceSpent: 2,
      hpRecovered: 0,
    })

    expect(result).toEqual({ ok: false, error: "insufficient-hit-dice" })
  })

  it("does not mutate its input", () => {
    const character = makeCharacter({ currentHP: 6, hitDiceRemaining: 3 })
    const snapshot = structuredClone(character)

    applyRespite(character, { hitDiceSpent: 1, hpRecovered: 5 })

    expect(character).toEqual(snapshot)
  })
})
