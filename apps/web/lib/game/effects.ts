import { z } from "zod/v4"
import { AFFINITIES, AFFINITY_DAMAGE_TYPES } from "./affinity"

/**
 * Static, always-on effect primitives shared by equippable items and passive
 * Skills. A neutral module — neither the items nor the skills domain owns it,
 * mirroring {@link ./affinity} and {@link ./attack} — so each domain composes
 * its own effect union from these without importing across the other.
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
})

/** A flat +/- bonus to an Attribute or the HP/SP pool. */
export const attributeEffectSchema = z.object({
  type: z.literal("attribute"),
  target: z.enum(BONUS_TARGET_KEYS),
  amount: z.number().int(),
})

export type AffinityEffect = z.infer<typeof affinityEffectSchema>
export type AttributeEffect = z.infer<typeof attributeEffectSchema>
