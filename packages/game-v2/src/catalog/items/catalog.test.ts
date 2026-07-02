import { describe, expect, it } from "vitest"

import {
  getEquippableItem,
  getItem,
  ITEMS,
} from "@workspace/game-v2/catalog/items"
import { renderFormula } from "@workspace/game-v2/combat/formula"

/**
 * Completeness + parity gate for the ported v1 Item catalog (UNN-533).
 * Importing the catalog already runs `itemSchema.parse` over every item and
 * asserts every granted-Skill effect resolves (the loader throws on a malformed
 * shape or a skill typo), so this asserts the **set** is complete — every v1 key
 * present, none dropped or renamed — plus spot-checks that the one reshape
 * (structured intrinsic-attack tier formulas) landed and the capability lookups
 * narrow correctly.
 */
const V1_ITEM_KEYS = [
  "longsword",
  "greataxe",
  "dagger",
  "grimoire",
  "runed-cane",
  "spear",
  "censer",
  "staff",
  "lute",
  "bladeturn-mail",
  "warlock-pact",
  "zephyr-band",
  "shadow-charm",
  "soul-drop",
] as const

describe("ported v1 Item catalog", () => {
  it("ports every v1 item key, with no extras", () => {
    expect(ITEMS).toHaveLength(V1_ITEM_KEYS.length)
    expect(new Set(ITEMS.map((i) => i.key))).toEqual(new Set(V1_ITEM_KEYS))
  })

  it.each(V1_ITEM_KEYS)("resolves %s by key", (key) => {
    expect(getItem(key)?.key).toBe(key)
  })

  it("narrows getEquippableItem to the equip capability", () => {
    expect(getEquippableItem("longsword")?.equip.slot).toBe("weapon")
    expect(getEquippableItem("bladeturn-mail")?.equip.slot).toBe("armor")
    expect(getEquippableItem("zephyr-band")?.equip.slot).toBe("accessory")
    expect(getEquippableItem("soul-drop")).toBeUndefined()
  })

  it("reshapes weapon intrinsic-attack tiers to structured formulas", () => {
    const equip = getEquippableItem("longsword")?.equip
    if (equip?.slot !== "weapon") throw new Error("longsword is not a weapon")
    const { attackRoll, damageType, delivery, range } = equip.intrinsicAttack
    expect({ damageType, delivery, range }).toEqual({
      damageType: "slash",
      delivery: "physical",
      range: { kind: "known", value: "engaged" },
    })
    expect(attackRoll.attribute).toBe("st")
    expect(
      attackRoll.tiers.map((t) => ({
        band: t.band,
        formula: t.formula && renderFormula(t.formula),
        sideEffects: t.sideEffects,
      }))
    ).toEqual([
      { band: "1-10", formula: "1 + St", sideEffects: [] },
      { band: "11-19", formula: "1d6 + St", sideEffects: [] },
      { band: "20+", formula: "1d6 + St", sideEffects: ["critical"] },
    ])
  })

  it("keeps the agility weapon's attack on Ag (dagger)", () => {
    const equip = getEquippableItem("dagger")?.equip
    if (equip?.slot !== "weapon") throw new Error("dagger is not a weapon")
    expect(equip.intrinsicAttack.attackRoll.attribute).toBe("ag")
    expect(equip.intrinsicAttack.damageType).toBe("pierce")
  })

  it("carries the runed cane's +1 Magic attribute effect and 1d4 tiers", () => {
    const equip = getEquippableItem("runed-cane")?.equip
    if (equip?.slot !== "weapon") throw new Error("runed-cane is not a weapon")
    expect(equip.effects).toEqual([
      { type: "attribute", target: "magic", amount: 1 },
    ])
    const midTier = equip.intrinsicAttack.attackRoll.tiers[1]
    expect(midTier?.formula && renderFormula(midTier.formula)).toBe("1d4 + St")
  })

  it("carries the armor/accessory passive effects verbatim", () => {
    expect(getEquippableItem("bladeturn-mail")?.equip.effects).toEqual([
      { type: "affinity", damageTypes: ["slash"], affinity: "resist" },
    ])
    expect(getEquippableItem("warlock-pact")?.equip.effects).toEqual([
      { type: "skill", skillKey: "ailment-boost" },
    ])
    expect(getEquippableItem("zephyr-band")?.equip.effects).toEqual([
      { type: "skill", skillKey: "garu" },
    ])
    expect(getEquippableItem("shadow-charm")?.equip.effects).toEqual([
      { type: "skill", skillKey: "evil-touch" },
    ])
  })

  it("keeps the consumable stackable and non-equippable", () => {
    const soulDrop = getItem("soul-drop")
    expect(soulDrop?.stackSize).toBe(999)
    expect(soulDrop?.consumable).toBe(true)
    expect(soulDrop?.equip).toBeUndefined()
  })
})
