import { z } from "zod/v4"

/**
 * Zone **Enchantments** — the Bard's unique mechanic (rulebook
 * `Skills/Mechanics/Enchantment.md`): a cast Skill may Enchant the Zone it
 * targets. Only one Zone is Enchanted at any one time; a repeat of the same
 * Enchantment on the same Zone raises its **Forte** — the dynamic-marking
 * scale *f → ff → fff*, capped at {@link MAX_FORTE} — and an Enchantment
 * grants the effects of its current Forte and all lower Fortes. Every
 * Enchantment ends when combat ends.
 *
 * A neutral vocabulary module like {@link ./counters} — the session schema
 * embeds {@link zoneEnchantmentSchema}, the Skill schema references
 * {@link ENCHANTMENT_TYPES}, and the per-type behavior (display names, the
 * Effects each Forte emits) lives in `engine/encounter/enchantment.ts`.
 */
export const ENCHANTMENT_TYPES = ["toccata", "requiem", "tarantella"] as const

export type EnchantmentType = (typeof ENCHANTMENT_TYPES)[number]

/** Forte caps at *fff* — three steps, matching the dynamic-marking ceiling. */
export const MAX_FORTE = 3

/**
 * The session's single active Enchantment: which Zone holds it, which type it
 * is, and its current Forte. Lives as a nullable **singleton** on
 * {@link import("../encounter/session").CombatSession} — not on the Zone —
 * because the one-Enchanted-Zone rule is structural that way: Enchanting a
 * second Zone simply overwrites the field.
 */
export const zoneEnchantmentSchema = z.object({
  zoneId: z.string(),
  type: z.enum(ENCHANTMENT_TYPES),
  forte: z.number().int().min(1).max(MAX_FORTE),
})
export type ZoneEnchantment = z.infer<typeof zoneEnchantmentSchema>

/**
 * The dynamic marking for a Forte value — `1 → "f"`, `2 → "ff"`, `3 → "fff"` —
 * the notation the zone badge renders (italicized, as on a score). Display
 * surfaces share it from here so the marking can't drift from the scale.
 */
export function forteMarking(forte: number): string {
  return "f".repeat(Math.max(1, Math.min(forte, MAX_FORTE)))
}
