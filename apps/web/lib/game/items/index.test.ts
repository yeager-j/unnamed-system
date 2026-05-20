import { describe, expect, it } from "vitest"
import { getSkill } from "../skills/index"
import {
  ACCESSORIES,
  ARMOR,
  getAllWeapons,
  getEquippableItem,
  getEquippedWeapon,
  getWeapon,
  WEAPONS,
} from "./index"
import { bladeturnMail } from "./bladeturn-mail"
import { longsword } from "./longsword"
import { runedCane } from "./runed-cane"
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

  it("resolves every catalog item by its own key across all slots", () => {
    for (const item of CATALOG) {
      expect(getEquippableItem(item.key)).toBe(item)
    }
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

describe("getEquippedWeapon", () => {
  it("returns the equipped Weapon when one is equipped", () => {
    const inventory = [
      { equipped: false, item: bladeturnMail },
      { equipped: true, item: longsword },
    ]
    expect(getEquippedWeapon(inventory)).toBe(longsword)
  })

  it("returns null when no item is equipped", () => {
    const inventory = [
      { equipped: false, item: longsword },
      { equipped: false, item: bladeturnMail },
    ]
    expect(getEquippedWeapon(inventory)).toBeNull()
  })

  it("returns null when the only equipped item is not a weapon", () => {
    const inventory = [
      { equipped: true, item: bladeturnMail },
      { equipped: false, item: longsword },
    ]
    expect(getEquippedWeapon(inventory)).toBeNull()
  })

  it("ignores unequipped weapons in favor of the equipped one", () => {
    const inventory = [
      { equipped: false, item: longsword },
      { equipped: true, item: runedCane },
    ]
    expect(getEquippedWeapon(inventory)).toBe(runedCane)
  })

  it("returns null when the entry's catalog item is undefined", () => {
    const inventory = [{ equipped: true, item: undefined }]
    expect(getEquippedWeapon(inventory)).toBeNull()
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
