import { describe, expect, it } from "vitest"

import { getSkill } from "@workspace/game-v2/catalog/skills"
import {
  attr,
  dice,
  flat,
  foldDamageBonuses,
  renderFormula,
} from "@workspace/game-v2/combat/formula"
import { hydrateFormulaText } from "@workspace/game-v2/skills/formula-text"

import {
  FIXTURE_ATTRIBUTES,
  PINNED_FLAT_RENDERINGS,
  PINNED_TIER_RENDERINGS,
} from "./__fixtures__/formula-rendering.fixture"

/**
 * The formula-rendering pin (UNN-557 item 5, UNN-548 item 4's procedure): v2's
 * structured rendering must reproduce v1's string rendering **byte for byte**
 * over the full catalog. The fixture was generated from v1's real render paths
 * (`apps/web/scripts/generate-formula-fixture.ts`) so this suite survives v1's
 * deletion (S4) — from then on the pinned strings ARE the oracle.
 *
 * The `withBonuses` case folds the documented bonus pair — Frenzy's `+3d4`
 * dice bonus and a flat zone `+2` — through v2's `foldDamageBonuses`, matching
 * v1's post-base splice.
 */

const FIXTURE_BONUS_TERMS = [dice(3, 4), flat(2)]

describe("tier formulas render byte-identically to v1", () => {
  it.each(PINNED_TIER_RENDERINGS)(
    "$skill $band",
    ({ skill: key, band, raw, hydrated, withBonuses }) => {
      const skill = getSkill(key)
      expect(skill, `v2 catalog is missing skill '${key}'`).toBeDefined()
      const tier = skill!.attackRoll?.tiers.find(
        (candidate) => candidate.band === band
      )
      expect(
        tier?.formula,
        `v2 '${key}' is missing a formula on band '${band}'`
      ).toBeDefined()

      expect(renderFormula(tier!.formula!)).toBe(raw)
      expect(renderFormula(tier!.formula!, FIXTURE_ATTRIBUTES)).toBe(hydrated)
      expect(
        renderFormula(
          foldDamageBonuses(tier!.formula!, FIXTURE_BONUS_TERMS),
          FIXTURE_ATTRIBUTES
        )
      ).toBe(withBonuses)
    }
  )
})

describe("flat magnitudes render byte-identically to v1", () => {
  // ⚠️ v1 stored a no-roll damage magnitude on `skill.damage` (a string) and a
  // heal magnitude on `skill.formula`; v2 stores both on `skill.formula` — the
  // generator did that mapping, so both pin against v2's `formula` here.
  it.each(PINNED_FLAT_RENDERINGS)("$skill", ({ skill: key, raw, hydrated }) => {
    const skill = getSkill(key)
    expect(skill, `v2 catalog is missing skill '${key}'`).toBeDefined()
    expect(skill!.formula, `v2 '${key}' is missing its flat formula`).toBe(raw)
    expect(hydrateFormulaText(skill!.formula!, FIXTURE_ATTRIBUTES)).toBe(
      hydrated
    )
  })
})

describe("the synthetic st-or-ma case", () => {
  // No catalog skill rolls `st-or-ma` today; pin the documented rendering so
  // the abbreviation and the max(St, Ma) hydration can't drift.
  const formula = [dice(1, 8), attr("st-or-ma")]

  it("renders the abbreviation un-hydrated", () => {
    expect(renderFormula(formula)).toBe("1d8 + St or Ma")
  })

  it("hydrates to max(St, Ma)", () => {
    expect(renderFormula(formula, FIXTURE_ATTRIBUTES)).toBe("1d8 + 4")
  })
})
