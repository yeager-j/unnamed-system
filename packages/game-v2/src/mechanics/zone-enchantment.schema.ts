import { z } from "zod/v4"

/**
 * Zone **Enchantments** — the Bard's mechanic vocabulary, re-declared in v2 (D32).
 * A cast Skill may Enchant the Zone it targets; only one Zone is Enchanted at a
 * time, and a repeat of the same Enchantment raises its **Forte** (the dynamic
 * marking *f → ff → fff*, capped at {@link MAX_FORTE}). An Enchantment grants the
 * effects of its current Forte and all lower Fortes; all end when combat ends.
 *
 * This is the **session/Map-Instance** state shape, **not** a persisted character
 * component — so it is deliberately absent from the `ComponentRegistry`/load seam.
 * The per-type behavior (display names, the Effects each Forte emits) lives in
 * {@link ./enchantment}; the encounter PR wires the active {@link ZoneEnchantment}
 * into `resolve`'s effects channel.
 */
export const ENCHANTMENT_TYPES = ["toccata", "requiem", "tarantella"] as const
export type EnchantmentType = (typeof ENCHANTMENT_TYPES)[number]

/** Forte caps at *fff* — three steps, matching the dynamic-marking ceiling. */
export const MAX_FORTE = 3

/**
 * The session's single active Enchantment: which Zone holds it, which type, and
 * its current Forte. A nullable singleton — Enchanting a second Zone overwrites it,
 * which is how the one-Enchanted-Zone rule stays structural.
 */
export const zoneEnchantmentSchema = z.object({
  zoneId: z.string(),
  type: z.enum(ENCHANTMENT_TYPES),
  forte: z.number().int().min(1).max(MAX_FORTE),
})
export type ZoneEnchantment = z.infer<typeof zoneEnchantmentSchema>

/**
 * The dynamic marking for a Forte — `1 → "f"`, `2 → "ff"`, `3 → "fff"` — clamped
 * to 1..{@link MAX_FORTE}. Display surfaces share it so the marking can't drift.
 */
export function forteMarking(forte: number): string {
  return "f".repeat(Math.max(1, Math.min(forte, MAX_FORTE)))
}
