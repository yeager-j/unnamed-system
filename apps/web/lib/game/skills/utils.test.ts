import { describe, expect, it } from "vitest"

import type { AttributeScores, HydratedSkill } from "../character"
import type { DamageType } from "../combat"
import type { SkillKind } from "../common"
import { dia } from "./heal/dia"
import { healersInsight } from "./passive/healers-insight"
import { cleave } from "./slash/cleave"
import {
  applyCast,
  canCast,
  formatSignedBonus,
  hydrateFormula,
  resolveAttackAttribute,
  resolveSkillCost,
  sortSkillsByKind,
  type CastingCharacter,
} from "./utils"

function makeSortable(
  name: string,
  kind: SkillKind,
  damageType?: DamageType
): HydratedSkill {
  return { name, kind, damageType } as unknown as HydratedSkill
}

describe("sortSkillsByKind", () => {
  it("groups skills by the documented display order: attack, heal, ailment, support, passive", () => {
    const input = [
      makeSortable("Auto-Rakukaja", "passive"),
      makeSortable("Knight's Proclamation", "support"),
      makeSortable("Evil Touch", "ailment"),
      makeSortable("Dia", "heal"),
      makeSortable("Cleave", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.kind)).toEqual([
      "attack",
      "heal",
      "ailment",
      "support",
      "passive",
    ])
  })

  it("orders attack skills by damage type per DAMAGE_TYPES (slash → pierce → strike → fire → …)", () => {
    const input = [
      makeSortable("Agi", "attack", "fire"),
      makeSortable("Skewer", "attack", "pierce"),
      makeSortable("Cleave", "attack", "slash"),
      makeSortable("Shield Arts", "attack", "strike"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Cleave",
      "Skewer",
      "Shield Arts",
      "Agi",
    ])
  })

  it("sorts alphabetically by name within the same damage type", () => {
    const input = [
      makeSortable("Tempest Slash", "attack", "slash"),
      makeSortable("Cleave", "attack", "slash"),
      makeSortable("Critical Strike", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Cleave",
      "Critical Strike",
      "Tempest Slash",
    ])
  })

  it("keeps a single-kind non-attack list alphabetized", () => {
    const input = [
      makeSortable("Media", "heal"),
      makeSortable("Dia", "heal"),
      makeSortable("Amrita Drop", "heal"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Amrita Drop",
      "Dia",
      "Media",
    ])
  })

  it("returns an empty array for an empty input", () => {
    expect(sortSkillsByKind([])).toEqual([])
  })

  it("does not mutate the input array", () => {
    const input = [
      makeSortable("Auto-Rakukaja", "passive"),
      makeSortable("Cleave", "attack", "slash"),
    ]
    const before = [...input]
    sortSkillsByKind(input)
    expect(input).toEqual(before)
  })
})

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
    expect(resolveSkillCost(cleave, withMaxHP(16))?.amount).toBe(1)
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

describe("applyCast", () => {
  it("deducts a flat SP cost from currentSP", () => {
    const result = applyCast(dia, makeCharacter({ currentSP: 10 }))
    expect(result.ok && result.value.currentSP).toBe(7)
  })

  it("deducts a resolved HP cost from currentHP", () => {
    const result = applyCast(cleave, withMaxHP(100, { currentHP: 60 }))
    expect(result.ok && result.value.currentHP).toBe(55)
  })

  it("rejects an SP cast when currentSP is below the cost", () => {
    const result = applyCast(dia, makeCharacter({ currentSP: 2 }))
    expect(result).toEqual({ ok: false, error: "insufficient-sp" })
  })

  it("allows an SP cast at exactly the cost (drops currentSP to 0)", () => {
    const result = applyCast(dia, makeCharacter({ currentSP: 3 }))
    expect(result.ok && result.value.currentSP).toBe(0)
  })

  it("rejects an HP cast at exactly the cost (a Skill cannot drop HP to 0)", () => {
    const result = applyCast(cleave, withMaxHP(100, { currentHP: 5 }))
    expect(result).toEqual({ ok: false, error: "insufficient-hp" })
  })

  it("rejects an HP cast below the cost", () => {
    const result = applyCast(cleave, withMaxHP(100, { currentHP: 3 }))
    expect(result).toEqual({ ok: false, error: "insufficient-hp" })
  })

  it("returns the character unchanged for a costless passive Skill", () => {
    const character = makeCharacter({ currentHP: 1, currentSP: 0 })
    const result = applyCast(healersInsight, character)
    expect(result.ok && result.value).toEqual(character)
  })

  it("does not mutate the input character", () => {
    const character = makeCharacter({ currentSP: 10 })
    const before = { ...character }
    applyCast(dia, character)
    expect(character).toEqual(before)
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

const attributes: AttributeScores = {
  strength: 3,
  magic: 4,
  agility: -1,
  luck: 2,
}

describe("resolveAttackAttribute", () => {
  it("looks up Strength / Magic / Agility directly", () => {
    expect(resolveAttackAttribute("st", attributes)).toBe(3)
    expect(resolveAttackAttribute("ma", attributes)).toBe(4)
    expect(resolveAttackAttribute("ag", attributes)).toBe(-1)
  })

  it("looks up Luck for Ailment Skills", () => {
    expect(resolveAttackAttribute("lu", attributes)).toBe(2)
  })

  it("picks the higher of Strength or Magic for st-or-ma", () => {
    expect(resolveAttackAttribute("st-or-ma", attributes)).toBe(4)
  })
})

describe("hydrateFormula", () => {
  it("substitutes a Magic attribute symbol with its concrete score", () => {
    expect(hydrateFormula("1d8 + Ma", attributes)).toBe("1d8 + 4")
  })

  it("substitutes the longer St-or-Ma pattern before the short ones", () => {
    expect(hydrateFormula("2d6 + St or Ma", attributes)).toBe("2d6 + 4")
  })

  it("renders a negative score with the unicode minus, not '+ -1'", () => {
    expect(hydrateFormula("1d4 + Ag", attributes)).toBe("1d4 − 1")
  })

  it("renders a leading minus operator as a subtraction", () => {
    expect(hydrateFormula("1d4 - Ma", attributes)).toBe("1d4 − 4")
  })

  it("substitutes the Lu attribute with the character's Luck score", () => {
    expect(hydrateFormula("1d6 + Lu", attributes)).toBe("1d6 + 2")
  })
})

describe("formatSignedBonus", () => {
  it("prefixes positives with +", () => {
    expect(formatSignedBonus(3)).toBe("+ 3")
  })

  it("uses a unicode minus for negatives", () => {
    expect(formatSignedBonus(-2)).toBe("− 2")
  })

  it("renders zero as a positive zero", () => {
    expect(formatSignedBonus(0)).toBe("+ 0")
  })
})
