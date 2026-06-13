import { describe, expect, it } from "vitest"

import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import { type AttackRollContext } from "@workspace/game/engine/combat/attack-roll"
import {
  foldDamageBonusesIntoFormula,
  resolveDamageBonuses,
} from "@workspace/game/engine/combat/damage-bonus"
import { type DamageBonus } from "@workspace/game/foundation/combat/effects"
import { type ActiveMechanic } from "@workspace/game/foundation/mechanics/schema"

const physicalAttack: AttackRollContext = {
  kind: "attack",
  damageType: "strike",
  delivery: "physical",
  attribute: "st",
}

const magicalAttack: AttackRollContext = {
  kind: "attack",
  damageType: "fire",
  delivery: "magical",
  attribute: "ma",
}

const frenzy = (pain: number, frenzyMode: boolean): ActiveMechanic => ({
  kind: "frenzy",
  state: { kind: "frenzy", pain, frenzyMode },
})

describe("resolveDamageBonuses", () => {
  it("surfaces the Frenzy Physical bonus as pain × d4 for a Physical Skill", () => {
    const character = makeStatContext({ activeMechanic: frenzy(3, true) })
    expect(resolveDamageBonuses(physicalAttack, character)).toEqual([
      { source: "Frenzy (Pain 3)", label: "+3d4" },
    ])
  })

  it("does not apply the Frenzy bonus to a Magical Skill", () => {
    const character = makeStatContext({ activeMechanic: frenzy(3, true) })
    expect(resolveDamageBonuses(magicalAttack, character)).toEqual([])
  })

  it("emits nothing when the Berserker is not in Frenzy Mode", () => {
    const character = makeStatContext({ activeMechanic: frenzy(3, false) })
    expect(resolveDamageBonuses(physicalAttack, character)).toEqual([])
  })

  it("emits nothing without an active mechanic", () => {
    const character = makeStatContext({ activeMechanic: null })
    expect(resolveDamageBonuses(physicalAttack, character)).toEqual([])
  })

  it("formats a flat damage Effect from a combat-context source", () => {
    const character = makeStatContext({
      activeMechanic: null,
      contextEffects: [
        { type: "damage", amount: 2, source: "Zone Boon" },
        { type: "damage", amount: -1, source: "Zone Hex" },
      ],
    })
    expect(resolveDamageBonuses(physicalAttack, character)).toEqual([
      { source: "Zone Boon", label: "+2" },
      { source: "Zone Hex", label: "−1" },
    ])
  })
})

describe("foldDamageBonusesIntoFormula", () => {
  const bonus = (label: string): DamageBonus => ({ source: "Frenzy", label })

  it("returns the formula unchanged when there are no bonuses", () => {
    expect(foldDamageBonusesIntoFormula("1d10 + St", [])).toBe("1d10 + St")
  })

  it("inserts a dice bonus after the leading damage term, before the Attribute", () => {
    expect(foldDamageBonusesIntoFormula("1d10 + St", [bonus("+3d4")])).toBe(
      "1d10 + 3d4 + St"
    )
  })

  it("handles a flat leading term (Rampage's `1 + St`)", () => {
    expect(foldDamageBonusesIntoFormula("1 + St", [bonus("+3d4")])).toBe(
      "1 + 3d4 + St"
    )
  })

  it("appends when the formula has no Attribute term", () => {
    expect(foldDamageBonusesIntoFormula("1d6", [bonus("+2d4")])).toBe(
      "1d6 + 2d4"
    )
  })

  it("folds multiple bonuses in order", () => {
    expect(
      foldDamageBonusesIntoFormula("1d10 + St", [bonus("+3d4"), bonus("+2")])
    ).toBe("1d10 + 3d4 + 2 + St")
  })
})
