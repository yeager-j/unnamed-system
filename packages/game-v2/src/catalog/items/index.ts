import { ACCESSORY_ITEMS } from "@workspace/game-v2/catalog/items/accessory"
import { ARMOR_ITEMS } from "@workspace/game-v2/catalog/items/armor"
import { CONSUMABLE_ITEMS } from "@workspace/game-v2/catalog/items/consumable"
import { WEAPON_ITEMS } from "@workspace/game-v2/catalog/items/weapon"
import { getSkill } from "@workspace/game-v2/catalog/skills"
import {
  isEquippable,
  itemSchema,
  type EquippableItem,
  type Item,
} from "@workspace/game-v2/items/item.schema"

/**
 * The ported v1 Item catalog (UNN-533) in the composed shape — the authored
 * content behind the `getItem`/`getEquippableItem` ports. One file per item under
 * a slot/category folder with a `Record`-keyed barrel, mirroring v1's
 * `data/items/` layout for a reviewable 1:1 diff; the only reshape is the weapon
 * intrinsic-attack tier `formula`, which references the shared `F` conversion
 * table (`catalog/skills/formulas.ts`) instead of authoring a free-form string.
 *
 * Each item is **validated at load** with {@link itemSchema} and indexed by its
 * unique `key`; the load also asserts the barrel key matches the item's own `key`
 * and — like v1's `validateItem` — that every granted-Skill effect resolves in the
 * Skill catalog, so a typo fails the import rather than a downstream lookup.
 */
const ITEMS_BY_KEY_RAW = {
  ...WEAPON_ITEMS,
  ...ARMOR_ITEMS,
  ...ACCESSORY_ITEMS,
  ...CONSUMABLE_ITEMS,
} satisfies Record<string, Item>

const ITEMS_BY_KEY = new Map<string, Item>()
for (const [key, item] of Object.entries(ITEMS_BY_KEY_RAW)) {
  const parsed = itemSchema.parse(item)
  if (parsed.key !== key) {
    throw new Error(
      `Catalog key mismatch: barrel "${key}" vs item.key "${parsed.key}"`
    )
  }
  for (const effect of parsed.equip?.effects ?? []) {
    if (effect.type === "skill" && !getSkill(effect.skillKey)) {
      throw new Error(
        `Item "${parsed.key}" references unknown skill "${effect.skillKey}"`
      )
    }
  }
  ITEMS_BY_KEY.set(key, parsed)
}

/** Every catalog item, validated and in registration order. */
export const ITEMS: readonly Item[] = [...ITEMS_BY_KEY.values()]

/** The whole-catalog port (UNN-559) — the add-item picker's enumeration. */
export function allItems(): readonly Item[] {
  return ITEMS
}

/** Looks up any catalog item by its slug key, across every capability. */
export function getItem(key: string): Item | undefined {
  return ITEMS_BY_KEY.get(key)
}

/**
 * Looks up an item by key, narrowed to the equippable capability — so
 * consumables never reach equip resolution or stat computation.
 */
export function getEquippableItem(key: string): EquippableItem | undefined {
  const item = getItem(key)
  return item && isEquippable(item) ? item : undefined
}
