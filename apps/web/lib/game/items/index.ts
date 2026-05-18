import { getSkill } from "../skills"
import {
  equippableItemSchema,
  type Accessory,
  type Armor,
  type EquippableItem,
  type Weapon,
} from "./schema"
import { bladeturnMail } from "./bladeturn-mail"
import { longsword } from "./longsword"
import { runedCane } from "./runed-cane"
import { zephyrBand } from "./zephyr-band"

/**
 * Structurally validates an item, then asserts every granted-Skill effect
 * resolves to a real Skill so a typo in the catalog fails the import rather
 * than a downstream lookup.
 */
function validate<T extends Weapon | Armor | Accessory>(item: T): T {
  equippableItemSchema.parse(item)

  for (const effect of item.effects ?? []) {
    if (effect.type === "skill" && !getSkill(effect.skillKey)) {
      throw new Error(
        `Item "${item.key}" references unknown skill "${effect.skillKey}"`
      )
    }
  }

  return item
}

const WEAPONS_BY_KEY = {
  longsword: validate(longsword),
  "runed-cane": validate(runedCane),
} as const satisfies Record<string, Weapon>

const ARMOR_BY_KEY = {
  "bladeturn-mail": validate(bladeturnMail),
} as const satisfies Record<string, Armor>

const ACCESSORIES_BY_KEY = {
  "zephyr-band": validate(zephyrBand),
} as const satisfies Record<string, Accessory>

export type WeaponKey = keyof typeof WEAPONS_BY_KEY
export type ArmorKey = keyof typeof ARMOR_BY_KEY
export type AccessoryKey = keyof typeof ACCESSORIES_BY_KEY

export const WEAPONS: readonly Weapon[] = Object.values(WEAPONS_BY_KEY)
export const ARMOR: readonly Armor[] = Object.values(ARMOR_BY_KEY)
export const ACCESSORIES: readonly Accessory[] = Object.values(ACCESSORIES_BY_KEY)

/**
 * Looks up a hardcoded Weapon by its slug key. Returns `undefined` when no
 * Weapon matches.
 */
export function getWeapon(key: string): Weapon | undefined {
  return (WEAPONS_BY_KEY as Record<string, Weapon>)[key]
}

/** Returns every hardcoded Weapon. */
export function getAllWeapons(): readonly Weapon[] {
  return WEAPONS
}

/**
 * Looks up any equippable catalog item by its slug key, across every slot.
 * Equipped-item resolution should go through this rather than
 * {@link getWeapon} so weapons, armor, and accessories all resolve. Returns
 * `undefined` when no item matches.
 */
export function getEquippableItem(key: string): EquippableItem | undefined {
  return (
    getWeapon(key) ??
    ARMOR.find((item) => item.key === key) ??
    ACCESSORIES.find((item) => item.key === key)
  )
}
