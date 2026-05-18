import { z } from "zod/v4"
import { DAMAGE_TYPES } from "../affinity"
import { attackRollSchema, DELIVERIES, rangeSchema } from "../attack"
import {
  affinityEffectSchema,
  type AffinityEffect,
  attributeEffectSchema,
  type AttributeEffect,
} from "../effects"
import type { SkillKey } from "../skills"

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
 * Fields shared by every equippable item regardless of slot. `effects` is
 * optional because most catalog items carry none.
 */
const baseFields = {
  key: itemKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  effects: itemEffectsSchema.optional(),
}

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

const weaponSchema = z.object({
  slot: z.literal("weapon"),
  ...baseFields,
  intrinsicAttack: intrinsicAttackSchema,
})

const armorSchema = z.object({
  slot: z.literal("armor"),
  ...baseFields,
})

const accessorySchema = z.object({
  slot: z.literal("accessory"),
  ...baseFields,
})

/**
 * Every equippable catalog item, discriminated by its single fixed `slot`. A
 * weapon can never be equipped as armor, etc.; only Weapons carry an
 * `intrinsicAttack`.
 */
export const equippableItemSchema = z.discriminatedUnion("slot", [
  weaponSchema,
  armorSchema,
  accessorySchema,
])

export type IntrinsicAttack = z.infer<typeof intrinsicAttackSchema>
export type Weapon = z.infer<typeof weaponSchema>
export type Armor = z.infer<typeof armorSchema>
export type Accessory = z.infer<typeof accessorySchema>
export type EquippableItem = z.infer<typeof equippableItemSchema>
