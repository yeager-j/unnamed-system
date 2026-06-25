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
import type {
  AffinityEffect,
  AttackRollEffect,
  AttributeEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const fireResist: AffinityEffect = {
  type: "affinity",
  damageTypes: ["fire"],
  affinity: "resist",
}
const strBonus: AttributeEffect = {
  type: "attribute",
  target: "strength",
  amount: 2,
}
const slashRoll: AttackRollEffect = {
  type: "attackRoll",
  when: { damageTypes: ["slash"] },
  amount: 2,
  source: "Slash Boost",
}

const slashBoost: Skill = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
  effects: [slashRoll],
})
const activeGrant: Skill = {
  kind: "support",
  key: "rally",
  name: "Rally",
  tagline: "t",
  description: "d",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
  range: { kind: "known", value: "engaged" },
  effects: [strBonus],
} as Skill

const lookups = makeItemLookups({
  items: [
    makeAccessory({ key: "ring", name: "Ring", effects: [fireResist] }),
    makeArmor({ key: "belt", name: "Belt", effects: [strBonus] }),
    makeWeapon({
      key: "blade",
      name: "Blade",
      effects: [{ type: "skill", skillKey: "slash-boost" }],
    }),
    makeWeapon({
      key: "wand",
      name: "Wand",
      effects: [{ type: "skill", skillKey: "rally" }],
    }),
    makeAccessory({
      key: "charm",
      name: "Charm",
      effects: [fireResist, { type: "skill", skillKey: "slash-boost" }],
    }),
  ],
  skills: [slashBoost, activeGrant],
})

const equipped = (catalogItemKey: string): InventoryItemState => ({
  id: catalogItemKey,
  catalogItemKey,
  equipped: true,
  quantity: 1,
})

const entityWith = (items: InventoryItemState[]): Entity => ({
  id: "e",
  components: { equipment: { items } },
})

describe("equipmentEffects", () => {
  it("emits an equipped item's direct affinity/attribute bonuses (source preserved, none synthesized)", () => {
    expect(
      equipmentEffects(
        lookups,
        entityWith([equipped("ring"), equipped("belt")])
      )
    ).toEqual([fireResist, strBonus])
  })

  it("lifts a granted PASSIVE skill's own effects; ignores an ACTIVE grant", () => {
    expect(equipmentEffects(lookups, entityWith([equipped("blade")]))).toEqual([
      slashRoll,
    ])
    expect(equipmentEffects(lookups, entityWith([equipped("wand")]))).toEqual(
      []
    )
  })

  it("a mixed item (affinity + skill grant) emits both arms once — no double-emit, no skillEffect leak", () => {
    const effects = equipmentEffects(lookups, entityWith([equipped("charm")]))
    expect(effects).toEqual([fireResist, slashRoll])
    expect(effects.some((e) => (e as { type: string }).type === "skill")).toBe(
      false
    )
  })

  it("ignores unequipped rows and unshipped keys", () => {
    const unequipped: InventoryItemState = {
      ...equipped("ring"),
      equipped: false,
    }
    expect(
      equipmentEffects(lookups, entityWith([unequipped, equipped("ghost")]))
    ).toEqual([])
  })

  it("contributes with NO archetype present (the deliberate v1 divergence)", () => {
    // The entity carries no `archetypes` component at all — v1 returned empty here.
    const entity = entityWith([equipped("ring")])
    expect(entity.components.archetypes).toBeUndefined()
    expect(equipmentEffects(lookups, entity)).toEqual([fireResist])
  })
})
