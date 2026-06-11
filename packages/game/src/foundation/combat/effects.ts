import { z } from "zod/v4"

import { LINEAGES } from "@workspace/game/foundation/character/lineage"
import {
  AFFINITIES,
  AFFINITY_DAMAGE_TYPES,
  DAMAGE_TYPES,
} from "@workspace/game/foundation/combat/affinity"
import { DELIVERIES } from "@workspace/game/foundation/combat/attack"
import { SKILL_KINDS } from "@workspace/game/foundation/common"

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
 * Optional gate restricting when an Attack Roll effect applies. Each axis is
 * a positive list: an axis matches when it is omitted, or when the
 * contextual value is one of the listed values. Multiple axes intersect
 * (all must match). An empty filter matches every Attack Roll.
 */
export const attackRollFilterSchema = z.object({
  damageTypes: z.array(z.enum(DAMAGE_TYPES)).min(1).optional(),
  deliveries: z.array(z.enum(DELIVERIES)).min(1).optional(),
  skillKinds: z.array(z.enum(SKILL_KINDS)).min(1).optional(),
})

/**
 * Dynamic amount resolution for an Attack Roll effect. Today only the
 * `perPartyLineage` scaler exists (Magic Circle, Ailment Boost); the kind
 * field reserves a discriminator for future scaler shapes.
 *
 * `amount` is per-ally; the resolver multiplies by the partyComposition count
 * for `lineage`, optionally subtracting 1 if `includesSelf` is false and the
 * character's active Archetype shares the Lineage.
 */
export const attackRollScalerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("perPartyLineage"),
    lineage: z.enum(LINEAGES),
    amount: z.number().int(),
    includesSelf: z.boolean(),
  }),
])

/**
 * A +/- bonus added to an Attack Roll. Today emitted by Archetype mechanics
 * (Perfection's flat +1..+4) and by passive Skills (Slash Boost's damage-type
 * filter, Magic Circle's delivery filter with a party-lineage scaler, Ailment
 * Boost's skill-kind filter with the same scaler).
 *
 * `when` filters when the bonus applies (per-Skill / per-weapon); `amount`
 * and `scaler` are mutually exclusive — exactly one must be present.
 */
export const attackRollEffectSchema = z
  .object({
    type: z.literal("attackRoll"),
    when: attackRollFilterSchema.optional(),
    amount: z.number().int().optional(),
    scaler: attackRollScalerSchema.optional(),
    source: z.string().optional(),
  })
  .refine(
    (effect) => (effect.amount !== undefined) !== (effect.scaler !== undefined),
    {
      message:
        "AttackRollEffect must have exactly one of `amount` or `scaler`.",
    }
  )

export type AffinityEffect = z.infer<typeof affinityEffectSchema>
export type AttributeEffect = z.infer<typeof attributeEffectSchema>
export type AttackRollFilter = z.infer<typeof attackRollFilterSchema>
export type AttackRollScaler = z.infer<typeof attackRollScalerSchema>
export type AttackRollEffect = z.infer<typeof attackRollEffectSchema>

/**
 * Any of the effect primitives, regardless of which domain emitted it — the
 * source-agnostic union for channels that carry effects from *outside* the
 * character's own state (e.g. a Zone Enchantment supplying combat-context
 * effects to the derive pipeline). Items, passive Skills, and mechanics keep
 * composing their own unions; this is the neutral name for "an effect from
 * anywhere".
 */
export type CombatantEffect =
  | AffinityEffect
  | AttributeEffect
  | AttackRollEffect
