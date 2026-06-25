import { describe, expect, it } from "vitest"

import {
  makeAccessory,
  makeArmor,
  makeItemLookups,
  makePassiveSkill,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import { equipmentEffects } from "@workspace/game-v2/items/equipment-effects"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  bearForm,
  shifterActive,
} from "@workspace/game-v2/mechanics/__fixtures__/shifter"
import {
  makeArchetype,
  makeDerivedEntity,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import {
  applyActiveForm,
  createResolveEntity,
} from "@workspace/game-v2/resolve/resolve-entity"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The equipment → `resolveEntity` → resolved read-units pipeline (UNN-503). Proves
 * the PR5 producer (equipment contribution) meets the PR3/PR4 fold: equipment
 * bonuses land in resolved attributes/affinities, granted-skill attack-roll effects
 * land in `pendingEffects` in C6 contributor order, and equipment passes through a
 * form (D19).
 */
const slashBoost: Skill = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
  effects: [
    {
      type: "attackRoll",
      when: { damageTypes: ["slash"] },
      amount: 2,
      source: "Slash Boost",
    },
  ],
})

const deps: GameData = {
  ...makeTestGameData({
    warrior: makeArchetype({
      lineage: "warrior",
      mechanic: "perfection",
      attributes: { strength: 2, magic: 0, agility: 0, luck: 0 },
    }),
  }),
  ...makeItemLookups({
    items: [
      makeArmor({
        key: "belt",
        name: "Belt",
        effects: [{ type: "attribute", target: "strength", amount: 2 }],
      }),
      makeAccessory({
        key: "ring",
        name: "Ring",
        effects: [
          { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
        ],
      }),
      makeWeapon({
        key: "blade",
        name: "Blade",
        effects: [{ type: "skill", skillKey: "slash-boost" }],
      }),
      // agility item for the form test (bear agility 3 + 2 = 5, clamp-free).
      makeAccessory({
        key: "anklet",
        name: "Anklet",
        effects: [{ type: "attribute", target: "agility", amount: 2 }],
      }),
    ],
    skills: [slashBoost],
  }),
}

const resolveEntity = createResolveEntity(deps)

const equipped = (catalogItemKey: string): InventoryItemState => ({
  id: catalogItemKey,
  catalogItemKey,
  equipped: true,
  quantity: 1,
})

describe("equipment contribution through resolveEntity", () => {
  it("folds equipment bonuses into attributes/affinities, and granted attack-roll effects into pendingEffects in C6 order", () => {
    const entity = makeDerivedEntity({
      active: "warrior",
      mechanics: { perfection: { kind: "perfection", rank: 3 } },
      equipment: [equipped("belt"), equipped("ring"), equipped("blade")],
    })
    const toccata = {
      type: "attackRoll",
      amount: 2,
      source: "Toccata",
    } as const
    const resolved = resolveEntity(entity, { effects: [toccata] })

    // base 0 + archetype +2 + belt +2
    expect(resolved.components.attributes?.strength).toBe(4)
    // ring fire resist (base chart empty)
    expect(resolved.components.affinities?.fire).toBe("resist")
    // C6: active mechanic → equipment passive skills → context effects
    expect(
      resolved.components.pendingEffects?.attackRoll.map((e) => e.source)
    ).toEqual(["Perfection (A)", "Slash Boost", "Toccata"])
  })

  it("contributes for an Archetype-less entity (the deliberate v1 divergence)", () => {
    const entity = makeDerivedEntity({
      active: null,
      equipment: [equipped("ring")],
    })
    expect(resolveEntity(entity).components.affinities?.fire).toBe("resist")
  })

  it("equipment passes through an active form — its bonus applies on top of the form's base", () => {
    // bearForm has base agility 3; the anklet's +2 must still apply under the form.
    // (The fixture form-swap mechanic isn't registry-backed, so compose applyForm +
    // equipmentEffects manually — the same two steps resolveEntity runs.)
    const resolve = createResolve(deps)
    const entity = makeDerivedEntity({
      active: null,
      equipment: [equipped("anklet")],
    })
    const formed = applyActiveForm(shifterActive(bearForm), entity)
    const resolved = resolve(formed, {
      effects: equipmentEffects(deps, formed),
    })
    expect(resolved.components.attributes?.agility).toBe(5) // 3 (bear) + 2 (anklet)
  })
})
