import { describe, expect, it } from "vitest"

import {
  FIXTURE_INTRINSIC_ATTACK,
  makeItemLookups,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import { resolveBasicAttack } from "@workspace/game-v2/items/basic-attack"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { IntrinsicAttack } from "@workspace/game-v2/items/item.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"

const lookups = makeItemLookups({
  items: [makeWeapon({ key: "sword", name: "Sword" })],
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

const NATURAL_ATTACK: IntrinsicAttack = {
  ...FIXTURE_INTRINSIC_ATTACK,
  damageType: "strike",
}

describe("resolveBasicAttack (D22 carve-out)", () => {
  it("weapon arm: the equipped weapon's intrinsic attack when no form is active", () => {
    expect(
      resolveBasicAttack(lookups, entityWith([equipped("sword")]), null)
    ).toEqual({
      source: "weapon",
      attack: FIXTURE_INTRINSIC_ATTACK,
    })
  })

  it("form arm: a form's natural attack REPLACES the equipped weapon's", () => {
    expect(
      resolveBasicAttack(
        lookups,
        entityWith([equipped("sword")]),
        NATURAL_ATTACK
      )
    ).toEqual({ source: "form", attack: NATURAL_ATTACK })
  })

  it("null when unarmed with no form", () => {
    expect(resolveBasicAttack(lookups, entityWith([]), null)).toBeNull()
  })
})
