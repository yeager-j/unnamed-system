import {
  isEquippable,
  type IntrinsicAttack,
  type Item,
  type ItemEffects,
} from "@workspace/game-v2/items/item.schema"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * Fixture builders for the items/skills tests (UNN-503). Authored here, not pulled
 * from the real catalog, so tests assert *behavior* (stacking, the equip swap, the
 * equipment contribution) against controlled shapes — the engine's fixture-first
 * discipline. `makeItemLookups` builds the `GameData` item/skill slice; spread it
 * over `makeTestGameData(archetypes)` when a test needs both.
 */

/** A minimal non-equippable, non-stackable item; override per test. */
export function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    key: "item",
    name: "Item",
    description: "A fixture item.",
    stackSize: 1,
    ...overrides,
  }
}

/** A fixture weapon intrinsic attack (engaged, Slash, Physical, no tiers). */
export const FIXTURE_INTRINSIC_ATTACK: IntrinsicAttack = {
  range: { kind: "known", value: "engaged" },
  damageType: "slash",
  delivery: "physical",
  attackRoll: { attribute: "st", tiers: [] },
}

interface WeaponOptions {
  key?: string
  name?: string
  effects?: ItemEffects
  intrinsicAttack?: IntrinsicAttack
}

export function makeWeapon(options: WeaponOptions = {}): Item {
  return makeItem({
    key: options.key ?? "weapon",
    name: options.name ?? "Weapon",
    equip: {
      slot: "weapon",
      effects: options.effects,
      intrinsicAttack: options.intrinsicAttack ?? FIXTURE_INTRINSIC_ATTACK,
    },
  })
}

interface GearOptions {
  key?: string
  name?: string
  effects?: ItemEffects
}

export function makeArmor(options: GearOptions = {}): Item {
  return makeItem({
    key: options.key ?? "armor",
    name: options.name ?? "Armor",
    equip: { slot: "armor", effects: options.effects },
  })
}

export function makeAccessory(options: GearOptions = {}): Item {
  return makeItem({
    key: options.key ?? "accessory",
    name: options.name ?? "Accessory",
    equip: { slot: "accessory", effects: options.effects },
  })
}

/** A fixture passive Skill carrying structured `effects` (for the equipment grant). */
export function makePassiveSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    kind: "passive",
    key: "passive-skill",
    name: "Passive Skill",
    tagline: "A passive.",
    description: "A fixture passive skill.",
    isSynthesis: false,
    ...overrides,
  } as Skill
}

/** Builds the `GameData` item/skill lookups from fixture lists, keyed by `key`. */
export function makeItemLookups(catalog: {
  items?: readonly Item[]
  skills?: readonly Skill[]
}): Pick<GameData, "getItem" | "getEquippableItem" | "getSkill"> {
  const items = new Map((catalog.items ?? []).map((item) => [item.key, item]))
  const skills = new Map(
    (catalog.skills ?? []).map((skill) => [skill.key, skill])
  )
  return {
    getItem: (key) => items.get(key),
    getEquippableItem: (key) => {
      const item = items.get(key)
      return item && isEquippable(item) ? item : undefined
    },
    getSkill: (key) => skills.get(key),
  }
}
