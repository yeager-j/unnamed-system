/**
 * Zone Enchantment vocabulary, re-declared in v2 (D32). The three Bard Zone
 * Enchantments — shared vocab, referenced by both the Skill schema (a Skill's
 * `enchantment` field) and the `mechanics/` zone-enchantment session state +
 * behavior. Kept zod-free and homed in `kernel/vocab` (like `DELIVERIES`/
 * `DAMAGE_TYPES`) so a `skills → mechanics` cross-domain import is never needed;
 * mirrors v1's neutral `foundation/combat/enchantment.ts` home.
 */
export const ENCHANTMENT_TYPES = ["toccata", "requiem", "tarantella"] as const

export type EnchantmentType = (typeof ENCHANTMENT_TYPES)[number]
