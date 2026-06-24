import { describe, expect, it } from "vitest"

import {
  attr,
  dice,
  flat,
  foldDamageBonuses,
  renderFormula,
  termLabel,
  type DamageFormula,
} from "@workspace/game-v2/combat/formula"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"

const WARRIOR: AttributeScores = { strength: 4, magic: -1, agility: 2, luck: 1 }

describe("renderFormula — un-hydrated (Attribute abbreviations)", () => {
  it("renders `base + Attribute` with the abbreviation", () => {
    expect(renderFormula([dice(1, 10), attr("st")])).toBe("1d10 + St")
    expect(renderFormula([flat(1), attr("ag")])).toBe("1 + Ag")
    expect(renderFormula([dice(2, 8), attr("st-or-ma")])).toBe("2d8 + St or Ma")
  })

  it("renders a single-term (base-only) formula bare", () => {
    expect(renderFormula([dice(8, 10)])).toBe("8d10")
  })
})

describe("renderFormula — hydrated (Attribute → score)", () => {
  it("substitutes the resolved score, signing it", () => {
    expect(renderFormula([dice(1, 8), attr("st")], WARRIOR)).toBe("1d8 + 4")
  })

  it("renders a negative score with the Unicode minus, not '+ -1'", () => {
    expect(renderFormula([dice(1, 8), attr("ma")], WARRIOR)).toBe("1d8 − 1")
  })

  it("st-or-ma hydrates to the higher of Strength and Magic", () => {
    expect(renderFormula([dice(1, 6), attr("st-or-ma")], WARRIOR)).toBe(
      "1d6 + 4"
    )
  })
})

describe("foldDamageBonuses", () => {
  const base: DamageFormula = [dice(1, 10), attr("st")]

  it("returns the formula unchanged when there are no bonuses", () => {
    expect(foldDamageBonuses(base, [])).toBe(base)
  })

  it("inserts bonus terms after the leading damage term, before the Attribute", () => {
    const folded = foldDamageBonuses(base, [dice(3, 4)])
    expect(folded).toEqual([dice(1, 10), dice(3, 4), attr("st")])
    expect(renderFormula(folded)).toBe("1d10 + 3d4 + St")
  })

  it("inserts after the lone term of a single-term formula", () => {
    expect(renderFormula(foldDamageBonuses([dice(1, 6)], [dice(2, 4)]))).toBe(
      "1d6 + 2d4"
    )
  })

  it("folds multiple bonuses in order", () => {
    const folded = foldDamageBonuses(base, [dice(3, 4), flat(2)])
    expect(renderFormula(folded)).toBe("1d10 + 3d4 + 2 + St")
  })

  it("renders a negative flat bonus with the Unicode minus", () => {
    expect(renderFormula(foldDamageBonuses(base, [flat(-1)]))).toBe(
      "1d10 − 1 + St"
    )
  })
})

describe("termLabel (standalone badge)", () => {
  it("formats a dice term", () => {
    expect(termLabel(dice(3, 4))).toBe("+3d4")
  })

  it("formats flat terms with the Unicode minus for negatives", () => {
    expect(termLabel(flat(2))).toBe("+2")
    expect(termLabel(flat(-2))).toBe("−2")
  })
})
