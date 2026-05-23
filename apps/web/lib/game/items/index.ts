import { getSkill } from "../skills"
import { bladeturnMail } from "./bladeturn-mail"
import { longsword } from "./longsword"
import { runedCane } from "./runed-cane"
import {
  equippableItemSchema,
  type Accessory,
  type Armor,
  type EquippableItem,
  type Weapon,
} from "./schema"
import { shadowCharm } from "./shadow-charm"
import { warlockPact } from "./warlock-pact"
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
  "warlock-pact": validate(warlockPact),
} as const satisfies Record<string, Armor>

const ACCESSORIES_BY_KEY = {
  "zephyr-band": validate(zephyrBand),
  "shadow-charm": validate(shadowCharm),
} as const satisfies Record<string, Accessory>

export type WeaponKey = keyof typeof WEAPONS_BY_KEY
export type ArmorKey = keyof typeof ARMOR_BY_KEY
export type AccessoryKey = keyof typeof ACCESSORIES_BY_KEY

export const WEAPONS: readonly Weapon[] = Object.values(WEAPONS_BY_KEY)
export const ARMOR: readonly Armor[] = Object.values(ARMOR_BY_KEY)
export const ACCESSORIES: readonly Accessory[] =
  Object.values(ACCESSORIES_BY_KEY)

/**
 * Looks up a hardcoded Weapon by its slug key. Returns `undefined` when no
 * Weapon matches.
 */
export function getWeapon(key: string): Weapon | undefined {
  return (WEAPONS_BY_KEY as Record<string, Weapon>)[key]
}

const EQUIPPABLE_ITEMS_BY_KEY: Record<string, EquippableItem> = {
  ...WEAPONS_BY_KEY,
  ...ARMOR_BY_KEY,
  ...ACCESSORIES_BY_KEY,
}

/**
 * Looks up any equippable catalog item by its slug key, across every slot.
 * Equipped-item resolution should go through this rather than
 * {@link getWeapon} so weapons, armor, and accessories all resolve. Returns
 * `undefined` when no item matches.
 */
export function getEquippableItem(key: string): EquippableItem | undefined {
  return EQUIPPABLE_ITEMS_BY_KEY[key]
}

/** Structural inventory slice that the slot helpers accept. */
type InventorySlice = readonly {
  equipped: boolean
  item: EquippableItem | undefined
}[]

/**
 * Maps an item's slot tag to its concrete catalog type, so a caller asking
 * for `"weapon"` gets back `Weapon | null` rather than the broader union.
 */
type ItemForSlot<S extends EquippableItem["slot"]> = Extract<
  EquippableItem,
  { slot: S }
>

/**
 * Returns the equipped item in `slot` from a character's hydrated inventory,
 * narrowed to the concrete slot type, or `null` when nothing is equipped. A
 * character may equip only one item per slot; if the persisted state ever
 * contains more than one, the first match wins. Accepts a structural slice so
 * the helper can stay in `lib/game/` without importing from `lib/db/`.
 */
export function getEquippedItem<S extends EquippableItem["slot"]>(
  inventory: InventorySlice,
  slot: S
): ItemForSlot<S> | null {
  const entry = inventory.find((e) => e.equipped && e.item?.slot === slot)
  return entry?.item?.slot === slot ? (entry.item as ItemForSlot<S>) : null
}
