import { describe, expect, it } from "vitest"

import {
  dealsTypedDamage,
  hasAttackRoll,
  isCastable,
  isPassive,
  skillSchema,
  type Skill,
} from "@workspace/game-v2/skills/skill.schema"

/**
 * The composed Skill shape (PR-S / UNN-506): the facets compose **orthogonally** to
 * `kind`, so these fixtures cover the cross-cutting cases the old `kind`-discriminated
 * union couldn't express — a rolled ailment, an Attack-Roll *support* Skill (Evil
 * Touch), a flat-damage attack, and a rolled-vs-flat heal. `skillSchema.parse` proves
 * each is a valid authored shape; the guards prove the presence reads.
 */
const base = {
  tagline: "t",
  description: "d",
  isSynthesis: false,
} as const
const castable = {
  ...base,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "engaged" },
} as const

/** A normal attack: rolls, and its magnitude is typed damage. */
const rolledAttack: Skill = {
  kind: "attack",
  key: "garu",
  name: "Garu",
  ...castable,
  damage: { damageType: "wind", delivery: "magical" },
  attackRoll: { attribute: "ma", tiers: [] },
}

/** A severe nuke: flat damage, no roll. */
const flatAttack: Skill = {
  kind: "attack",
  key: "megaton",
  name: "Megaton Raid",
  ...castable,
  formula: "12d10",
  damage: { damageType: "strike", delivery: "physical" },
}

/** Evil Touch — authored Support, yet rolls and inflicts an ailment; carries a
 *  duration and **no** typed damage. The shape the union couldn't model. */
const rolledSupport: Skill = {
  kind: "support",
  key: "evil-touch",
  name: "Evil Touch",
  ...castable,
  attackRoll: { attribute: "lu", tiers: [] },
  duration: 3,
}

/** A flat heal: untyped magnitude, no roll, no `damage` facet. */
const flatHeal: Skill = {
  kind: "heal",
  key: "dia",
  name: "Dia",
  ...castable,
  formula: "2d8 + Ma",
}

/** A cure-only heal: castable, but no magnitude at all (Amrita Drop). */
const cureOnly: Skill = {
  kind: "heal",
  key: "amrita-drop",
  name: "Amrita Drop",
  ...castable,
}

/** A passive: base only — no cost/range, so not castable. */
const passive: Skill = {
  kind: "passive",
  key: "slash-boost",
  name: "Slash Boost",
  ...base,
  effects: [{ type: "attribute", target: "strength", amount: 1 }],
}

describe("skillSchema — every facet composes orthogonally to kind", () => {
  it.each([
    ["rolled attack", rolledAttack],
    ["flat-damage attack", flatAttack],
    ["rolled Attack-Roll support (Evil Touch)", rolledSupport],
    ["flat heal", flatHeal],
    ["cure-only heal", cureOnly],
    ["passive", passive],
  ])("accepts a %s", (_label, skill) => {
    expect(skillSchema.parse(skill)).toEqual(skill)
  })
})

describe("presence guards", () => {
  it("isCastable — true iff a cost facet is present", () => {
    expect(isCastable(rolledAttack)).toBe(true)
    expect(isCastable(cureOnly)).toBe(true)
    expect(isCastable(passive)).toBe(false)
  })

  it("isPassive — reads the intent tag, independent of the castable facet", () => {
    expect(isPassive(passive)).toBe(true)
    expect(isPassive(rolledSupport)).toBe(false)
    expect(isPassive(flatHeal)).toBe(false)
  })

  it("hasAttackRoll — true iff the Skill rolls, regardless of kind", () => {
    expect(hasAttackRoll(rolledAttack)).toBe(true)
    expect(hasAttackRoll(rolledSupport)).toBe(true) // a support that rolls
    expect(hasAttackRoll(flatAttack)).toBe(false) // an attack that doesn't
    expect(hasAttackRoll(flatHeal)).toBe(false)
  })

  it("dealsTypedDamage — true iff the typed-damage facet is present", () => {
    expect(dealsTypedDamage(rolledAttack)).toBe(true)
    expect(dealsTypedDamage(flatAttack)).toBe(true)
    expect(dealsTypedDamage(rolledSupport)).toBe(false) // rolls, but no damage type
    expect(dealsTypedDamage(flatHeal)).toBe(false)
  })
})
