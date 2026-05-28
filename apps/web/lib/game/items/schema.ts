import { z } from "zod/v4"

import { DAMAGE_TYPES } from "../combat/affinity"
import { attackRollSchema, DELIVERIES, rangeSchema } from "../combat/attack"
import {
  affinityEffectSchema,
  attributeEffectSchema,
  type AffinityEffect,
  type AttributeEffect,
} from "../combat/effects"
import type { SkillKey } from "../skills/registry"

const itemKeySchema = z.string().regex(/^[a-z0-9-]+$/)

const skillEffectSchema = z.object({
  type: z.literal("skill"),
  skillKey: z.string().min(1),
})

/** Any combination of Affinity / Attribute / Skill effects on an item. */
export const itemEffectsSchema = z.array(
  z.discriminatedUnion("type", [
    affinityEffectSchema,
    attributeEffectSchema,
    skillEffectSchema,
  ])
)

type SkillEffect = Omit<z.infer<typeof skillEffectSchema>, "skillKey"> & {
  skillKey: SkillKey
}

/**
 * One item effect, with the granted-Skill reference narrowed to
 * {@link SkillKey}. The Zod schema stays structural; existence is enforced by
 * the items index validator at load time.
 */
export type ItemEffect = AffinityEffect | AttributeEffect | SkillEffect
export type ItemEffects = ItemEffect[]

/**
 * A Weapon's built-in attack. Mechanically identical to a Skill's Attack Roll
 * (rulebook 3.3), so it reuses the Skill {@link rangeSchema} and
 * {@link attackRollSchema} verbatim rather than redefining the threshold shape.
 * It is intrinsic to the weapon and is *not* modelled as a granted-Skill effect.
 */
export const intrinsicAttackSchema = z.object({
  range: rangeSchema,
  damageType: z.enum(DAMAGE_TYPES),
  delivery: z.enum(DELIVERIES),
  attackRoll: attackRollSchema,
})
export type IntrinsicAttack = z.infer<typeof intrinsicAttackSchema>

/** The three equip slots; a character may equip one item per slot. */
export const EQUIP_SLOTS = ["weapon", "armor", "accessory"] as const
export type EquipSlot = (typeof EQUIP_SLOTS)[number]

/**
 * The **equippable** capability of an item: which slot it occupies, the passive
 * effects it confers while equipped, and — weapons only — its intrinsic attack.
 * Discriminated by `slot` so only weapons can carry an `intrinsicAttack`.
 */
const equipSpecSchema = z.discriminatedUnion("slot", [
  z.object({
    slot: z.literal("weapon"),
    effects: itemEffectsSchema.optional(),
    intrinsicAttack: intrinsicAttackSchema,
  }),
  z.object({
    slot: z.literal("armor"),
    effects: itemEffectsSchema.optional(),
  }),
  z.object({
    slot: z.literal("accessory"),
    effects: itemEffectsSchema.optional(),
  }),
])

/**
 * Every catalog item is one `Item`; its **capabilities compose** rather than
 * partitioning items into mutually-exclusive kinds:
 *
 * - **equippable** — carries an {@link equip} spec (slot + effects + weapon
 *   intrinsic attack). Absent on pure consumables/materials.
 * - **stackable** — `stackSize > 1`; multiple units share one inventory row.
 * - **consumable** — flagged by `consumable` (a future use-action seam; today
 *   it only drives display grouping).
 *
 * Because the traits are orthogonal, a thrown consumable weapon
 * (`equip` + `consumable` + `stackSize > 1`) or a stackable artifact
 * (`equip` + `stackSize > 1`) needs no new kind.
 */
export const itemSchema = z.object({
  key: itemKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  stackSize: z.number().int().min(1).default(1),
  equip: equipSpecSchema.optional(),
  consumable: z.boolean().optional(),
})

/**
 * The equip spec with `effects` narrowed to {@link ItemEffect} (so a
 * granted-Skill effect's `skillKey` must be a real {@link SkillKey}). The Zod
 * schema stays structural; the narrowing is enforced at compile time on the
 * hardcoded catalog (`satisfies Item`) and at load time by the items index
 * validator.
 */
export type EquipSpec =
  | { slot: "weapon"; effects?: ItemEffects; intrinsicAttack: IntrinsicAttack }
  | { slot: "armor"; effects?: ItemEffects }
  | { slot: "accessory"; effects?: ItemEffects }

/** A catalog item with its capability traits (see {@link itemSchema}). */
export type Item = Omit<z.infer<typeof itemSchema>, "equip"> & {
  equip?: EquipSpec
}

/** An item that carries the equippable capability. */
export type EquippableItem = Item & { equip: EquipSpec }

/** An equippable item in a given slot, with its slot-specific equip spec. */
export type ItemForSlot<S extends EquipSlot> = Item & {
  equip: Extract<EquipSpec, { slot: S }>
}

/** An equippable weapon — its equip spec always carries an intrinsic attack. */
export type EquippedWeapon = ItemForSlot<"weapon">

/** Whether the item can be equipped (carries an {@link EquipSpec}). */
export function isEquippable(item: Item): item is EquippableItem {
  return item.equip !== undefined
}

/** Whether multiple units of the item share one inventory row. */
export function isStackable(item: Item): boolean {
  return item.stackSize > 1
}

/** Whether the item is flagged consumable. */
export function isConsumable(item: Item): boolean {
  return item.consumable === true
}
