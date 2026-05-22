import { describe, expect, it } from "vitest"

import {
  formatSignedBonus,
  hydrateFormula,
  resolveAttackAttribute,
} from "./skill-display"
import type { AttributeScores } from "./stats"

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
