import { z } from "zod/v4"

import { AFFINITIES, AFFINITY_DAMAGE_TYPES } from "./affinity"

/**
 * Static, always-on effect primitives shared by equippable items, passive
 * Skills, and Archetype mechanics. A neutral module — no domain owns it,
 * mirroring {@link ./affinity} and {@link ./attack} — so each domain composes
 * its own effect union from these without importing across the others.
 *
 * Effects optionally carry a `source` label used by the UI to break down where
 * a bonus comes from (e.g. "Perfection (B)" contributing +2 to the Attack
 * Roll). Items and passive Skills omit it today; mechanic emitters supply it.
 */

/**
 * Targets a flat stat bonus can modify: the four Attributes plus the HP and SP
 * pools.
 */
export const BONUS_TARGET_KEYS = [
  "hp",
  "sp",
  "strength",
  "magic",
  "agility",
  "luck",
] as const
export type BonusTargetKey = (typeof BONUS_TARGET_KEYS)[number]

/** Sets a fixed Affinity on one or more damage types. */
export const affinityEffectSchema = z.object({
  type: z.literal("affinity"),
  damageTypes: z.array(z.enum(AFFINITY_DAMAGE_TYPES)).min(1),
  affinity: z.enum(AFFINITIES),
  source: z.string().optional(),
})

/** A flat +/- bonus to an Attribute or the HP/SP pool. */
export const attributeEffectSchema = z.object({
  type: z.literal("attribute"),
  target: z.enum(BONUS_TARGET_KEYS),
  amount: z.number().int(),
  source: z.string().optional(),
})

/**
 * A flat +/- bonus added to every Attack Roll the character makes. Emitted by
 * Archetype mechanics (e.g. Warrior's Perfection grants +1/+2/+3/+4 at C/B/A/S).
 * No item or passive Skill carries this kind today; it is reserved for
 * mechanics until a non-mechanic source needs it.
 */
export const attackRollEffectSchema = z.object({
  type: z.literal("attackRoll"),
  amount: z.number().int(),
  source: z.string().optional(),
})

export type AffinityEffect = z.infer<typeof affinityEffectSchema>
export type AttributeEffect = z.infer<typeof attributeEffectSchema>
export type AttackRollEffect = z.infer<typeof attackRollEffectSchema>
