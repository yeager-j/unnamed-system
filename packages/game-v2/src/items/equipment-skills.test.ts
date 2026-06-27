import { describe, expect, it } from "vitest"

import {
  makeAccessory,
  makeItemLookups,
  makePassiveSkill,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import { equipmentGrantedSkills } from "@workspace/game-v2/items/equipment-skills"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const slashBoost: Skill = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
})
const rally: Skill = {
  kind: "support",
  key: "rally",
  name: "Rally",
  tagline: "t",
  description: "d",
  isSynthesis: false,
  cost: { kind: "sp", amount: 3 },
}

const lookups = makeItemLookups({
  items: [
    makeWeapon({
      key: "blade",
      effects: [{ type: "skill", skillKey: "slash-boost" }],
    }),
    makeWeapon({
      key: "wand",
      effects: [{ type: "skill", skillKey: "rally" }],
    }),
    makeAccessory({
      key: "charm",
      effects: [
        { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
        { type: "skill", skillKey: "slash-boost" },
      ],
    }),
    makeWeapon({
      key: "ghost-stick",
      effects: [{ type: "skill", skillKey: "missing" }],
    }),
  ],
  skills: [slashBoost, rally],
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

describe("equipmentGrantedSkills", () => {
  it("collects granted Skills — passive and active alike", () => {
    expect(
      equipmentGrantedSkills(
        lookups,
        entityWith([equipped("blade"), equipped("wand")])
      ).map((s) => s.key)
    ).toEqual(["slash-boost", "rally"])
  })

  it("picks the skill grant out of a mixed item, ignoring its affinity/attribute arms", () => {
    expect(
      equipmentGrantedSkills(lookups, entityWith([equipped("charm")])).map(
        (s) => s.key
      )
    ).toEqual(["slash-boost"])
  })

  it("drops grants whose Skill key no longer resolves, and ignores unequipped rows", () => {
    const unequipped: InventoryItemState = {
      ...equipped("blade"),
      equipped: false,
    }
    expect(
      equipmentGrantedSkills(
        lookups,
        entityWith([unequipped, equipped("ghost-stick")])
      )
    ).toEqual([])
  })
})
