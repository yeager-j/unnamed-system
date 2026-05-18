import {
  equippableItemSchema,
  type Accessory,
  type Armor,
  type Weapon,
} from "./schema"
import { longsword } from "./longsword"

function validate<T extends Weapon | Armor | Accessory>(item: T): T {
  equippableItemSchema.parse(item)
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
