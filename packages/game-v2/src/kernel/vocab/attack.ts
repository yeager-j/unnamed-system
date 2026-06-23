/**
 * Attack-delivery vocabulary, re-declared in v2 (D32). Only the slice the
 * effects primitive needs is carried here: `DELIVERIES`. The full Attack Roll
 * shape (thresholds, ranges, the d20 mechanic) is a combat-domain concern and
 * re-homes with the `combat` domain PR. Kept zod-free.
 */

/**
 * Damage delivery printed in parentheses after the damage type, e.g. the
 * "(Magical)" in "Fire (Magical)".
 */
export const DELIVERIES = ["physical", "magical"] as const

export type Delivery = (typeof DELIVERIES)[number]
