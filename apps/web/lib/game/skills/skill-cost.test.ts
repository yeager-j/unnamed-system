import { describe, expect, it } from "vitest"

import { dia } from "./heal/dia"
import { healersInsight } from "./passive/healers-insight"
import { canCast, resolveSkillCost, type CastingCharacter } from "./skill-cost"
import { cleave } from "./slash/cleave"

/**
 * Balanced path at level 1 has 20 max HP with no bonuses; `hp` manual bonus
 * shifts max HP to an exact target so HP-percentage rounding can be asserted
 * precisely. `cleave` is a 5%-HP Skill, `dia` a flat 3 SP Skill,
 * `healersInsight` a costless passive.
 */
function makeCharacter(
  overrides: Partial<CastingCharacter> = {}
): CastingCharacter {
  return {
    pathChoice: "balanced",
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: "warrior",
    archetypes: [{ key: "warrior", rank: 2 }],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
    currentHP: 100,
    currentSP: 100,
    ...overrides,
  }
}

function withMaxHP(maxHP: number, overrides: Partial<CastingCharacter> = {}) {
  return makeCharacter({ manualBonuses: { hp: maxHP - 20 }, ...overrides })
}

describe("resolveSkillCost", () => {
  it("passes a flat SP cost through unchanged", () => {
    expect(resolveSkillCost(dia, makeCharacter())).toEqual({
      kind: "sp",
      amount: 3,
    })
  })

  it("resolves an HP-percentage cost against current max HP", () => {
    expect(resolveSkillCost(cleave, withMaxHP(100))).toEqual({
      kind: "hp",
      amount: 5,
    })
  })

  it("rounds the HP cost down across varying max HP values", () => {
    expect(resolveSkillCost(cleave, withMaxHP(20))?.amount).toBe(1)
    expect(resolveSkillCost(cleave, withMaxHP(30))?.amount).toBe(1)
    expect(resolveSkillCost(cleave, withMaxHP(105))?.amount).toBe(5)
    expect(resolveSkillCost(cleave, withMaxHP(194))?.amount).toBe(9)
  })

  it("floors the resolved HP cost at 1, never 0", () => {
    // 5% of 16 max HP floors to 0 arithmetically, but a Skill that declares an
    // HP cost should always charge at least 1 HP.
    expect(resolveSkillCost(cleave, withMaxHP(16))?.amount).toBe(1)
    // Even at very low max HP the floor still kicks in.
    expect(resolveSkillCost(cleave, withMaxHP(5))?.amount).toBe(1)
  })

  it("resolves against current max HP, not current HP", () => {
    const character = withMaxHP(100, { currentHP: 12 })
    expect(resolveSkillCost(cleave, character)?.amount).toBe(5)
  })

  it("returns null for a costless passive Skill", () => {
    expect(resolveSkillCost(healersInsight, makeCharacter())).toBeNull()
  })
})

describe("canCast", () => {
  it("allows an SP Skill when current SP exceeds the cost", () => {
    expect(canCast(dia, makeCharacter({ currentSP: 4 }))).toBe(true)
  })

  it("allows an SP Skill when current SP exactly equals the cost", () => {
    expect(canCast(dia, makeCharacter({ currentSP: 3 }))).toBe(true)
  })

  it("rejects an SP Skill when current SP is below the cost", () => {
    expect(canCast(dia, makeCharacter({ currentSP: 2 }))).toBe(false)
  })

  it("allows an HP Skill when current HP exceeds the cost", () => {
    expect(canCast(cleave, withMaxHP(100, { currentHP: 6 }))).toBe(true)
  })

  it("rejects an HP Skill when current HP exactly equals the cost", () => {
    expect(canCast(cleave, withMaxHP(100, { currentHP: 5 }))).toBe(false)
  })

  it("rejects an HP Skill when current HP is below the cost", () => {
    expect(canCast(cleave, withMaxHP(100, { currentHP: 4 }))).toBe(false)
  })

  it("always allows a costless passive Skill", () => {
    expect(canCast(healersInsight, makeCharacter({ currentHP: 1 }))).toBe(true)
  })
})
