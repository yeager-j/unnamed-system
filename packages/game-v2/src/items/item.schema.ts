import { z } from "zod/v4"

import {
  attackRollSchema,
  rangeSchema,
} from "@workspace/game-v2/combat/attack.schema"
import {
  affinityEffectSchema,
  attributeEffectSchema,
  type AffinityEffect,
  type AttributeEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import { DAMAGE_TYPES } from "@workspace/game-v2/kernel/vocab/affinity"
import { DELIVERIES } from "@workspace/game-v2/kernel/vocab/attack"

/**
 * The **composed Item** shape, ported as-is from v1 `foundation/items/schema.ts`
 * (D32 — `Item` was already capability-composed, the v2 thesis one level down).
 * Embeds re-point to v2: the weapon intrinsic attack reuses the `combat` attack
 * schema (`rangeSchema`/`attackRollSchema`); the effect union reuses the kernel
 * effect primitives plus a **local `skillEffect`** (a grant reference, item-only —
 * deliberately not in the kernel `CombatantEffect` union, which is folded effects).
 *
 * **Interim note:** `skillEffect.skillKey` stays a bare `string` (validated at
 * catalog load when content lands), not the v1 `SkillKey` registry narrowing — the
 * composed-Skill model is PR-S (D32).
 */

/** A catalog item slug: lowercase alphanumerics and hyphens. */
export const itemKeySchema = z.string().regex(/^[a-z0-9-]+$/)

/** A granted-Skill reference carried by an equippable item. Item-local; resolved
 *  to the granted Skill's own effects at fold time, never folded itself. */
const skillEffectSchema = z.object({
  type: z.literal("skill"),
  skillKey: z.string().min(1),
})
export type SkillEffect = z.infer<typeof skillEffectSchema>

/** Any combination of Affinity / Attribute / Skill effects on an item. */
export const itemEffectsSchema = z.array(
  z.discriminatedUnion("type", [
    affinityEffectSchema,
    attributeEffectSchema,
    skillEffectSchema,
  ])
)

/** One item effect: a passive Affinity/Attribute bonus, or a granted-Skill ref. */
export type ItemEffect = AffinityEffect | AttributeEffect | SkillEffect
export type ItemEffects = ItemEffect[]

/**
 * A Weapon's built-in attack. Mechanically identical to a Skill's Attack Roll
 * (rulebook 3.3), so it reuses the `combat` `rangeSchema`/`attackRollSchema`
 * verbatim. Intrinsic to the weapon, *not* modelled as a granted-Skill effect.
 * (Richer than v1's: the v2 attack tier carries a structured `DamageFormula` +
 * ordered side effects — D22's "weapon basic attack mirrors a Skill attack".)
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
 * The **equippable** capability: which slot the item occupies, the passive effects
 * it confers while equipped, and — weapons only — its intrinsic attack.
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
 * - **equippable** — carries an {@link equipSpecSchema equip} spec.
 * - **stackable** — `stackSize > 1`; multiple units share one inventory row.
 * - **consumable** — flagged by `consumable` (display grouping today).
 *
 * Because the traits are orthogonal, a thrown consumable weapon or a stackable
 * artifact needs no new kind.
 */
export const itemSchema = z.object({
  key: itemKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  stackSize: z.number().int().min(1).default(1),
  equip: equipSpecSchema.optional(),
  consumable: z.boolean().optional(),
})

/** The equip spec, narrowed per slot so a slot lookup needs no cast. */
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

/**
 * Whether the item is equipped into `slot`, narrowed to that slot's concrete
 * equip spec — letting the discriminated {@link EquipSpec} narrow back through the
 * parent {@link Item}, so slot lookups need no `as` cast.
 */
export function isItemForSlot<S extends EquipSlot>(
  item: Item,
  slot: S
): item is ItemForSlot<S> {
  return item.equip?.slot === slot
}

/** Whether multiple units of the item share one inventory row. */
export function isStackable(item: Item): boolean {
  return item.stackSize > 1
}

/** Whether the item is flagged consumable. */
export function isConsumable(item: Item): boolean {
  return item.consumable === true
}

/**
 * The vocabulary of owner-mode inventory edits, shared by the optimistic mutation
 * engine (`items/mutate`) and the Server Action dispatcher (at cutover). Each
 * variant maps to one pure engine transition. A logic-free command type, so it
 * lives beside the item vocabulary it edits.
 */
export type InventoryMutation =
  | { kind: "equip"; itemId: string }
  | { kind: "unequip"; itemId: string }
  | { kind: "add"; catalogItemKey: string; quantity: number }
  | { kind: "setQuantity"; itemId: string; quantity: number }
  | { kind: "remove"; itemId: string }
