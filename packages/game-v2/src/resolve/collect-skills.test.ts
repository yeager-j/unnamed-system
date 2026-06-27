import { describe, expect, it } from "vitest"

import {
  makeAccessory,
  makeItemLookups,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  makeArchetype,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import {
  collectSkills,
  passiveSkillEffects,
} from "@workspace/game-v2/resolve/collect-skills"
import { applyForm } from "@workspace/game-v2/resolve/resolve"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const strBuff: CombatantEffect = {
  type: "attribute",
  target: "strength",
  amount: 2,
}
const magBuff: CombatantEffect = {
  type: "attribute",
  target: "magic",
  amount: 3,
}
const lukBuff: CombatantEffect = {
  type: "attribute",
  target: "luck",
  amount: 1,
}
const agiBuff: CombatantEffect = {
  type: "attribute",
  target: "agility",
  amount: 1,
}

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "passive",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

const intrinsicPassive = skill({ key: "intrinsic-passive", effects: [lukBuff] })
const archPassive = skill({ key: "arch-passive", effects: [strBuff] })
const archActive = skill({
  key: "arch-active",
  kind: "attack",
  cost: { kind: "sp", amount: 1 },
})
const inhPassive = skill({ key: "inh-passive", effects: [magBuff] })
const equipPassive = skill({ key: "equip-passive", effects: [] })
// Reachable from BOTH the archetype kit and an equipped item — the dedup case.
const shared = skill({ key: "shared", effects: [agiBuff] })

const deps = {
  ...makeTestGameData({
    warrior: makeArchetype({
      key: "warrior",
      skills: [
        { rank: 1, skill: "arch-passive" },
        { rank: 1, skill: "arch-active" },
        { rank: 1, skill: "shared" },
      ],
    }),
  }),
  ...makeItemLookups({
    items: [
      makeWeapon({
        key: "blade",
        effects: [{ type: "skill", skillKey: "equip-passive" }],
      }),
      makeAccessory({
        key: "stone",
        effects: [{ type: "skill", skillKey: "shared" }],
      }),
    ],
    skills: [
      intrinsicPassive,
      archPassive,
      archActive,
      inhPassive,
      equipPassive,
      shared,
    ],
  }),
}

/** A PC fielding all four skill sources: intrinsic + archetype kit + inheritance + equipment. */
const pc: Entity = {
  id: "pc",
  components: {
    skills: [{ kind: "inline", skill: intrinsicPassive }],
    archetypes: {
      active: "warrior",
      origin: "warrior",
      savedArchetypeRanks: 0,
      roster: [
        {
          key: "warrior",
          rank: 1,
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceArchetypeKey: "mage",
              skillKey: "inh-passive",
            },
          ],
        },
      ],
    },
    equipment: {
      items: [
        { id: "1", catalogItemKey: "blade", equipped: true, quantity: 1 },
        { id: "2", catalogItemKey: "stone", equipped: true, quantity: 1 },
      ],
    },
  },
}

describe("collectSkills — the one deduped collection (intrinsic + kit + inheritance + equipment)", () => {
  it("unions all four sources in source order, active and passive alike", () => {
    expect(collectSkills(deps, pc, pc).map((s) => s.key)).toEqual([
      "intrinsic-passive",
      "arch-passive",
      "arch-active",
      "shared",
      "inh-passive",
      "equip-passive",
    ])
  })

  it("dedupes by key — a Skill granted by two sources appears once (first source wins)", () => {
    // `shared` is on the archetype kit AND the `stone` accessory; it lands once, at
    // its archetype position — not again from equipment.
    const keys = collectSkills(deps, pc, pc).map((s) => s.key)
    expect(keys.filter((k) => k === "shared")).toEqual(["shared"])
  })

  it("under a form: kit suppressed, inheritance + equipment + intrinsic survive", () => {
    const formed = applyForm(pc, {
      attributes: { base: { strength: 9, magic: 0, agility: 0, luck: 0 } },
    })
    // kit reads `formed` (active nulled ⇒ no arch-* / arch-`shared`); inheritance reads
    // the original (warrior intact ⇒ inh-passive survives); equipment + intrinsic carry
    // through. `shared` now comes from equipment only — still once.
    expect(collectSkills(deps, formed, pc).map((s) => s.key)).toEqual([
      "intrinsic-passive",
      "inh-passive",
      "equip-passive",
      "shared",
    ])
  })
})

describe("passiveSkillEffects — the passive half of the collection", () => {
  it("folds each passive's effects (incl. intrinsic), skips actives, and never double-folds a dedup", () => {
    // Passives, in collection order: intrinsic(luk) → arch(str) → shared(agi) →
    // inh(mag) → equip(none). arch-active contributes nothing; `shared` folds once.
    expect(passiveSkillEffects(collectSkills(deps, pc, pc))).toEqual([
      lukBuff,
      strBuff,
      agiBuff,
      magBuff,
    ])
  })

  it("is empty for a collection of only active Skills", () => {
    expect(passiveSkillEffects([archActive])).toEqual([])
  })
})
