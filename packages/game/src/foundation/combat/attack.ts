import { z } from "zod/v4"

import { SIDE_EFFECT_KEYS } from "@workspace/game/foundation/combat/side-effects"

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
export const ATTACK_ATTRIBUTES = ["st", "ma", "ag", "lu", "st-or-ma"] as const
export type AttackAttribute = (typeof ATTACK_ATTRIBUTES)[number]

/**
 * Display names for each {@link AttackAttribute}, used by the resolver as the
 * first source in an Attack Roll's labelled breakdown. `"st-or-ma"` keeps both
 * names so the breakdown stays honest about which is in play. Lives with the
 * type rather than in the UI label store because the game engine — not a UI
 * surface — is the only consumer.
 */
export const ATTACK_ATTRIBUTE_LABELS = {
  st: "Strength",
  ma: "Magic",
  ag: "Agility",
  lu: "Luck",
  "st-or-ma": "Strength or Magic",
} as const satisfies Record<AttackAttribute, string>

/**
 * Known Range values. Attacks outside this set carry an explicit string via
 * the {@link rangeSchema} escape hatch so unusual ranges never block
 * transcription.
 */
export const RANGES = [
  "engaged",
  "all-engaged",
  "same-zone",
  "adjacent-zone",
  "same-or-adjacent-zone",
  "all",
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
 * (Shield Arts 20+ applies Sukunda *and* Critical), and each entry is a key
 * into the canonical Side Effect registry in {@link ./side-effects}.
 * `formula` is optional: damage-Skill tiers author one, but Ailment-Skill
 * tiers carry side effects only and have nothing to compute.
 */
export const attackTierSchema = z.object({
  band: z.string().min(1),
  formula: z.string().min(1).optional(),
  sideEffects: z.array(z.enum(SIDE_EFFECT_KEYS)),
})

export const attackRollSchema = z.object({
  attribute: z.enum(ATTACK_ATTRIBUTES),
  tiers: z.array(attackTierSchema),
})

export type AttackRange = z.infer<typeof rangeSchema>
export type AttackTier = z.infer<typeof attackTierSchema>
export type AttackRoll = z.infer<typeof attackRollSchema>

/** One labelled contributor to a resolved Attack Roll. Surfaced to the UI
 *  so the Skill card renders `Magic +4  Magic Circle +2` instead of an
 *  opaque `+6`. */
export interface AttackRollSource {
  source: string
  amount: number
}

/**
 * The complete labelled readout for one Attack Roll: every contributor
 * already summed and labelled, with the rolling Attribute as the first
 * source. Components only render — no addition happens client-side. The
 * engine-derived readout that pairs with the authored {@link AttackRoll}.
 */
export interface ResolvedAttackRoll {
  /** Grand total — rolling Attribute plus every matching effect contribution. */
  total: number
  /** Per-source breakdown, attribute first, then effects in collection order.
   *  Effect contributions resolving to 0 are omitted; the attribute is
   *  always present even at 0 so the player can see the base. */
  sources: AttackRollSource[]
}
