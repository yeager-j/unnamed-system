import { getSkill } from "../skills"
import { shadowCharm } from "./accessory/shadow-charm"
import { zephyrBand } from "./accessory/zephyr-band"
import { bladeturnMail } from "./armor/bladeturn-mail"
import { warlockPact } from "./armor/warlock-pact"
import { soulDrop } from "./consumable/soul-drop"
import {
  isConsumable,
  isEquippable,
  isItemForSlot,
  itemSchema,
  type EquippableItem,
  type EquippedWeapon,
  type EquipSlot,
  type Item,
  type ItemForSlot,
} from "./schema"
import { censer } from "./weapon/censer"
import { longsword } from "./weapon/longsword"
import { runedCane } from "./weapon/runed-cane"
import { spear } from "./weapon/spear"
import { staff } from "./weapon/staff"

/**
 * Structurally validates an item, then asserts every granted-Skill effect
 * resolves to a real Skill so a typo in the catalog fails the import rather
 * than a downstream lookup.
 */
function validate<T extends Item>(item: T): T {
  itemSchema.parse(item)

  for (const effect of item.equip?.effects ?? []) {
    if (effect.type === "skill" && !getSkill(effect.skillKey)) {
      throw new Error(
        `Item "${item.key}" references unknown skill "${effect.skillKey}"`
      )
    }
  }

  return item
}

/**
 * Every catalog item by key. The single registry over which capability traits
 * (equippable / stackable / consumable) are queried — there is no per-kind
 * map, so a future hybrid item is added here once and surfaces everywhere.
 */
const ITEMS_BY_KEY = {
  longsword: validate(longsword),
  "runed-cane": validate(runedCane),
  spear: validate(spear),
  censer: validate(censer),
  staff: validate(staff),
  "bladeturn-mail": validate(bladeturnMail),
  "warlock-pact": validate(warlockPact),
  "zephyr-band": validate(zephyrBand),
  "shadow-charm": validate(shadowCharm),
  "soul-drop": validate(soulDrop),
} as const satisfies Record<string, Item>

export type ItemKey = keyof typeof ITEMS_BY_KEY

/**
 * The keys of catalog items that carry the weapon equip capability. A mapped
 * type that walks every {@link ItemKey} and keeps a key `K` only when that
 * item's concrete type is assignable to {@link EquippedWeapon} (its
 * `equip.slot` is `"weapon"`), mapping the rest to `never`; indexing the
 * result by `[ItemKey]` then unions the surviving keys. If a future catalog
 * change makes this resolve to `never`, check that the intended weapons still
 * satisfy `EquippedWeapon` rather than a wider `Item`.
 */
export type WeaponKey = {
  [K in ItemKey]: (typeof ITEMS_BY_KEY)[K] extends EquippedWeapon ? K : never
}[ItemKey]

export const ITEMS: readonly Item[] = Object.values(ITEMS_BY_KEY)

/**
 * Runtime lookup index keyed by arbitrary `string`, so {@link getItem} can
 * resolve a persisted `catalogItemKey` against the catalog without widening
 * the literal-keyed {@link ITEMS_BY_KEY} (whose precise keys exist only to
 * derive {@link ItemKey} / {@link WeaponKey}).
 */
const ITEM_INDEX: ReadonlyMap<string, Item> = new Map(
  Object.entries(ITEMS_BY_KEY)
)

/** Equippable items in a slot, for the add-item picker's grouped listing. */
function itemsInSlot<S extends EquipSlot>(slot: S): readonly ItemForSlot<S>[] {
  return ITEMS.filter((item): item is ItemForSlot<S> =>
    isItemForSlot(item, slot)
  )
}

export const WEAPONS: readonly EquippedWeapon[] = itemsInSlot("weapon")
export const ARMOR: readonly ItemForSlot<"armor">[] = itemsInSlot("armor")
export const ACCESSORIES: readonly ItemForSlot<"accessory">[] =
  itemsInSlot("accessory")
export const CONSUMABLES: readonly Item[] = ITEMS.filter(isConsumable)

/**
 * Looks up any catalog item by its slug key, across every capability. Returns
 * `undefined` when no item matches. Inventory hydration goes through this so
 * non-equippable items (consumables) resolve too.
 */
export function getItem(key: string): Item | undefined {
  return ITEM_INDEX.get(key)
}

/**
 * Looks up an item by key, narrowed to the equippable capability. Returns
 * `undefined` when no item matches or the item cannot be equipped — so
 * consumables never reach equip resolution or stat computation.
 */
export function getEquippableItem(key: string): EquippableItem | undefined {
  const item = getItem(key)
  return item && isEquippable(item) ? item : undefined
}

/**
 * Looks up a Weapon by key. Returns `undefined` when no item matches or the
 * item is not equippable into the weapon slot.
 */
export function getWeapon(key: string): EquippedWeapon | undefined {
  const item = getItem(key)
  return item && isItemForSlot(item, "weapon") ? item : undefined
}

/** Structural inventory slice that the slot helper accepts. */
type InventorySlice = readonly {
  equipped: boolean
  item: Item | undefined
}[]

/**
 * Returns the equipped item in `slot` from a character's hydrated inventory,
 * narrowed to the concrete slot type, or `null` when nothing is equipped. A
 * character may equip only one item per slot; if the persisted state ever
 * contains more than one, the first match wins. Accepts a structural slice so
 * the helper can stay in `lib/game/` without importing from `lib/db/`.
 */
export function getEquippedItem<S extends EquipSlot>(
  inventory: InventorySlice,
  slot: S
): ItemForSlot<S> | null {
  for (const entry of inventory) {
    if (entry.equipped && entry.item && isItemForSlot(entry.item, slot)) {
      return entry.item
    }
  }
  return null
}
