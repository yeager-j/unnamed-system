import { describe, expect, it } from "vitest"

import {
  findUnregisteredEntries,
  loadCatalogEntryModules,
} from "@workspace/game/data/catalog/registered-entries"
import {
  ACCESSORIES,
  ARMOR,
  getEquippableItem,
  getItem,
  getWeapon,
  WEAPONS,
} from "@workspace/game/data/items/registry"
import { longsword } from "@workspace/game/data/items/weapon/longsword"
import { getSkill } from "@workspace/game/data/skills/registry"
import { itemSchema } from "@workspace/game/foundation/items/schema"

const CATALOG = [...WEAPONS, ...ARMOR, ...ACCESSORIES]

describe("item catalog data", () => {
  it("has a unique, slug-shaped key for every item", () => {
    const keys = CATALOG.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("resolves every Weapon by its own key", () => {
    for (const weapon of WEAPONS) {
      expect(getWeapon(weapon.key)).toBe(weapon)
    }
  })

  it("resolves every catalog item by its own key across all slots", () => {
    for (const item of CATALOG) {
      expect(getEquippableItem(item.key)).toBe(item)
    }
  })

  it("resolves every granted-Skill effect to a real Skill", () => {
    for (const item of CATALOG) {
      for (const effect of item.equip?.effects ?? []) {
        if (effect.type === "skill") {
          expect(getSkill(effect.skillKey)).toBeDefined()
        }
      }
    }
  })

  it("registers every entry file on disk", async () => {
    const modules = await loadCatalogEntryModules(import.meta.dirname)
    expect(findUnregisteredEntries(modules, getItem)).toEqual([])
  })
})

describe("getWeapon", () => {
  it("returns the matching Weapon by key", () => {
    expect(getWeapon("longsword")).toBe(longsword)
  })

  it("returns undefined for an unknown key", () => {
    expect(getWeapon("nope")).toBeUndefined()
  })
})

describe("Longsword transcription (PRD §6.2)", () => {
  it("matches the Longsword snapshot end-to-end", () => {
    expect(itemSchema.parse(longsword)).toMatchSnapshot()
  })

  it("keeps the intrinsic attack exactly as printed", () => {
    expect(WEAPONS).toContain(longsword)
    expect(longsword.equip.intrinsicAttack.range).toEqual({
      kind: "known",
      value: "engaged",
    })
    expect(longsword.equip.intrinsicAttack.damageType).toBe("slash")
    expect(longsword.equip.intrinsicAttack.delivery).toBe("physical")
    expect(longsword.equip.intrinsicAttack.attackRoll.attribute).toBe("st")
    expect(longsword.equip.intrinsicAttack.attackRoll.tiers).toEqual([
      { band: "1-10", formula: "1 + St", sideEffects: [] },
      { band: "11-19", formula: "1d6 + St", sideEffects: [] },
      { band: "20+", formula: "1d6 + St", sideEffects: ["critical"] },
    ])
  })
})
