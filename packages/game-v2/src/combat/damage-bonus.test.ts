import { describe, expect, it } from "vitest"

import type { AttackRollContext } from "@workspace/game-v2/combat/attack-roll"
import {
  damageEffectTerm,
  resolveDamageBonuses,
} from "@workspace/game-v2/combat/damage-bonus"
import type { DamageEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

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

function resolved(damage: DamageEffect[] = []): ResolvedEntity {
  return {
    id: "fx",
    components: { pendingEffects: { attackRoll: [], damage } },
  }
}

const frenzyPhysical: DamageEffect = {
  type: "damage",
  when: { deliveries: ["physical"] },
  dice: { count: 3, sides: 4 },
  source: "Frenzy (Pain 3)",
}

describe("resolveDamageBonuses", () => {
  it("D1: surfaces a matching dice effect as a dice term with its source", () => {
    expect(
      resolveDamageBonuses(physicalAttack, resolved([frenzyPhysical]))
    ).toEqual([
      { source: "Frenzy (Pain 3)", term: { kind: "dice", count: 3, sides: 4 } },
    ])
  })

  it("D3: a `when` filter excludes a non-matching context (physical effect, magical attack)", () => {
    expect(
      resolveDamageBonuses(magicalAttack, resolved([frenzyPhysical]))
    ).toEqual([])
  })

  it("emits nothing when there are no damage effects", () => {
    expect(resolveDamageBonuses(physicalAttack, resolved())).toEqual([])
  })

  it("reduces flat effects to flat terms, defaulting a missing source to 'Bonus'", () => {
    const effects: DamageEffect[] = [
      { type: "damage", amount: 2, source: "Zone Boon" },
      { type: "damage", amount: -1, source: "Zone Hex" },
      { type: "damage", amount: 4 },
    ]
    expect(resolveDamageBonuses(physicalAttack, resolved(effects))).toEqual([
      { source: "Zone Boon", term: { kind: "flat", amount: 2 } },
      { source: "Zone Hex", term: { kind: "flat", amount: -1 } },
      { source: "Bonus", term: { kind: "flat", amount: 4 } },
    ])
  })
})

describe("damageEffectTerm", () => {
  it("maps a dice effect to a dice term", () => {
    expect(
      damageEffectTerm({ type: "damage", dice: { count: 2, sides: 6 } })
    ).toEqual({
      kind: "dice",
      count: 2,
      sides: 6,
    })
  })

  it("maps a flat effect to a flat term", () => {
    expect(damageEffectTerm({ type: "damage", amount: -3 })).toEqual({
      kind: "flat",
      amount: -3,
    })
  })
})
