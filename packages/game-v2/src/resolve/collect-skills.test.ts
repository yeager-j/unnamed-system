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
  skillEffects,
} from "@workspace/game-v2/resolve/collect-skills"
import { applyForm } from "@workspace/game-v2/resolve/form-swap-policy"
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
const castableBuff: CombatantEffect = {
  type: "attribute",
  target: "strength",
  amount: 4,
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
// A castable Skill (has a `cost`) that ALSO carries an always-on effect — its effect
// folds regardless of castability.
const archActive = skill({
  key: "arch-active",
  kind: "attack",
  cost: { kind: "sp", amount: 1 },
  effects: [castableBuff],
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
      currency: 0,
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

  it("under a form: kit suppressed, intrinsic replaced, inheritance + equipment survive (UNN-600)", () => {
    const formed = applyForm(pc, {
      attributes: { base: { strength: 9, magic: 0, agility: 0, luck: 0 } },
    })
    // kit reads `formed` (active nulled ⇒ no arch-* / arch-`shared`); intrinsic reads
    // `formed` too — this form authors no skills, so the body has none (absent means
    // absent). Inheritance reads the original (warrior intact ⇒ inh-passive survives);
    // equipment carries through. `shared` now comes from equipment only — still once.
    expect(collectSkills(deps, formed, pc).map((s) => s.key)).toEqual([
      "inh-passive",
      "equip-passive",
      "shared",
    ])
  })
})

describe("skillEffects — every collected Skill's always-on effects (castability-independent)", () => {
  it("folds each Skill's effects (intrinsic + a castable Skill's too), never double-folding a dedup", () => {
    // Effects in collection order: intrinsic(luk) → arch-passive(str) →
    // arch-active(castable, str+4) → shared(agi) → inh(mag) → equip(none). The
    // castable arch-active contributes its effect; `shared` folds once.
    expect(skillEffects(collectSkills(deps, pc, pc))).toEqual([
      lukBuff,
      strBuff,
      castableBuff,
      agiBuff,
      magBuff,
    ])
  })

  it("folds a castable Skill's effects — a `cost` does not gate the effects axis", () => {
    expect(skillEffects([archActive])).toEqual([castableBuff])
  })

  it("is empty only when no collected Skill carries effects", () => {
    const bare = skill({
      key: "bare",
      kind: "attack",
      cost: { kind: "sp", amount: 1 },
    })
    expect(skillEffects([bare])).toEqual([])
  })
})
