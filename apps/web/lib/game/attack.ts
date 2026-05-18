import { z } from "zod/v4"

/**
 * The Attack Roll mechanic (rulebook 3.3) is identical for Skills and weapons:
 * roll a d20, add an Attribute, compare to a table of bands. These primitives
 * are shared by both domains; neither owns them.
 */

/**
 * Damage delivery printed in parentheses after the damage type, e.g. the
 * "(Magical)" in "Fire (Magical)".
 */
export const DELIVERIES = ["physical", "magical"] as const
export type Delivery = (typeof DELIVERIES)[number]

/**
 * The attribute added to an Attack Roll. "st-or-ma" is the documented
 * either-or variant used by a handful of Skills and weapons.
 */
export const ATTACK_ATTRIBUTES = ["st", "ma", "ag", "st-or-ma"] as const
export type AttackAttribute = (typeof ATTACK_ATTRIBUTES)[number]

/**
 * Known Range values. Attacks outside this set carry an explicit string via
 * the {@link rangeSchema} escape hatch so unusual ranges never block
 * transcription.
 */
export const RANGES = [
  "engaged",
  "all-engaged",
  "same-zone",
  "same-or-adjacent-zone",
] as const
export type Range = (typeof RANGES)[number]

export const rangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), value: z.enum(RANGES) }),
  z.object({ kind: z.literal("explicit"), value: z.string().min(1) }),
])

/**
 * One row of the Attack Roll table. `band` is free-form ("1-10", "16+",
 * "11-15"…) because the rulebook does not fix the boundaries.
 * `sideEffects` is ordered because a single band can carry several
 * (Shield Arts 20+ applies Sukunda *and* Critical).
 */
export const attackTierSchema = z.object({
  band: z.string().min(1),
  formula: z.string().min(1),
  sideEffects: z.array(z.string().min(1)),
})

export const attackRollSchema = z.object({
  attribute: z.enum(ATTACK_ATTRIBUTES),
  tiers: z.array(attackTierSchema),
})

export type AttackRange = z.infer<typeof rangeSchema>
export type AttackTier = z.infer<typeof attackTierSchema>
export type AttackRoll = z.infer<typeof attackRollSchema>
