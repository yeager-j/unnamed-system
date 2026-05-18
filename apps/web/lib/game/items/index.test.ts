import { describe, expect, it } from "vitest"
import { getSkill } from "../skills/index"
import {
  ACCESSORIES,
  ARMOR,
  getAllWeapons,
  getWeapon,
  WEAPONS,
} from "./index"
import { longsword } from "./longsword"
import { equippableItemSchema } from "./schema"

const CATALOG = [...WEAPONS, ...ARMOR, ...ACCESSORIES]

describe("item catalog data", () => {
  it("validates every catalog item against the schema", () => {
    for (const item of CATALOG) {
      expect(() => equippableItemSchema.parse(item)).not.toThrow()
    }
  })

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

  it("ships empty Armor and Accessory catalogs at MVP", () => {
    expect(ARMOR).toEqual([])
    expect(ACCESSORIES).toEqual([])
  })

  it("resolves every granted-Skill effect to a real Skill", () => {
    for (const item of CATALOG) {
      for (const effect of item.effects ?? []) {
        if (effect.type === "skill") {
          expect(getSkill(effect.skillKey)).toBeDefined()
        }
      }
    }
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
    expect(equippableItemSchema.parse(longsword)).toMatchSnapshot()
  })

  it("keeps the intrinsic attack exactly as printed", () => {
    expect(getAllWeapons()).toContain(longsword)
    expect(longsword.intrinsicAttack.range).toEqual({
      kind: "known",
      value: "engaged",
    })
    expect(longsword.intrinsicAttack.damageType).toBe("slash")
    expect(longsword.intrinsicAttack.delivery).toBe("physical")
    expect(longsword.intrinsicAttack.attackRoll.attribute).toBe("st")
    expect(longsword.intrinsicAttack.attackRoll.tiers).toEqual([
      { band: "1-10", formula: "1 + St", sideEffects: [] },
      { band: "11-19", formula: "1d6 + St", sideEffects: [] },
      { band: "20+", formula: "1d6 + St", sideEffects: ["Critical"] },
    ])
  })
})
