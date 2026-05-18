import { getSkill } from "../skills"
import {
  equippableItemSchema,
  type Accessory,
  type Armor,
  type EquippableItem,
  type Weapon,
} from "./schema"
import { longsword } from "./longsword"

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
} as const satisfies Record<string, Weapon>

export type WeaponKey = keyof typeof WEAPONS_BY_KEY

export const WEAPONS: readonly Weapon[] = Object.values(WEAPONS_BY_KEY)

/**
 * Armor and accessory catalogs are structurally supported but ship empty at
 * MVP (PRD §9). Typed so callers can iterate them without narrowing.
 */
export const ARMOR: readonly Armor[] = []
export const ACCESSORIES: readonly Accessory[] = []

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
 * Armor and accessory catalogs ship empty at MVP so this resolves Weapons
 * today, but equipped-item resolution should go through this rather than
 * {@link getWeapon} so non-weapon slots work once those catalogs gain content.
 * Returns `undefined` when no item matches.
 */
export function getEquippableItem(key: string): EquippableItem | undefined {
  return (
    getWeapon(key) ??
    ARMOR.find((item) => item.key === key) ??
    ACCESSORIES.find((item) => item.key === key)
  )
}
