import { describe, expect, it } from "vitest"

import { makePassiveSkill } from "@workspace/game-v2/items/__fixtures__/catalog"
import { skillAttackRollContext } from "@workspace/game-v2/skills/attack-context"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const base = {
  tagline: "t",
  description: "d",
  isSynthesis: false,
  cost: { kind: "sp", amount: 1 },
  range: { kind: "known", value: "engaged" },
} as const

const attackWithRoll: Skill = {
  kind: "attack",
  key: "garu",
  name: "Garu",
  ...base,
  damageType: "wind",
  delivery: "magical",
  attackRoll: { attribute: "ma", tiers: [] },
} as Skill

const attackNoRoll: Skill = {
  kind: "attack",
  key: "megaton",
  name: "Megaton",
  ...base,
  damageType: "strike",
  delivery: "physical",
  damage: "12d10",
} as Skill

const ailment: Skill = {
  kind: "ailment",
  key: "evil-touch",
  name: "Evil Touch",
  ...base,
  attackRoll: { attribute: "lu", tiers: [] },
} as Skill

const heal: Skill = {
  kind: "heal",
  key: "dia",
  name: "Dia",
  ...base,
} as Skill

describe("skillAttackRollContext", () => {
  it("attack arm: kind + damageType + delivery + attribute", () => {
    // toStrictEqual so the attack arm's presence of damageType/delivery is asserted.
    expect(skillAttackRollContext(attackWithRoll)).toStrictEqual({
      kind: "attack",
      damageType: "wind",
      delivery: "magical",
      attribute: "ma",
    })
  })

  it("ailment arm: attribute only — the absence of damageType/delivery is meaningful", () => {
    // toStrictEqual (not toEqual) so the missing damageType/delivery is load-bearing.
    expect(skillAttackRollContext(ailment)).toStrictEqual({
      kind: "ailment",
      attribute: "lu",
    })
  })

  it("null for Skills that make no Attack Roll", () => {
    expect(skillAttackRollContext(attackNoRoll)).toBeNull() // attack with no roll table
    expect(skillAttackRollContext(heal)).toBeNull()
    expect(skillAttackRollContext(makePassiveSkill())).toBeNull()
  })
})
