import { type WeaponKey } from "../items"
import type { Lineage } from "./lineage"

/**
 * The starting weapon equipped on a character at finalization, keyed by the
 * Origin Archetype's Lineage (PRD §5.1 step 5 / §5.2 — "Equipment is not
 * chosen in the builder. The starting weapon is the canonical weapon for the
 * character's Origin Lineage; it can be customized from the live sheet after
 * creation.").
 *
 * Covers every Lineage that ships an Archetype at MVP (warrior / knight /
 * mage / healer). The remaining {@link Lineage}s have no Archetypes to
 * select as Origin, so no character can finalize against them — the map is
 * `Partial` so a future Lineage that ships an Archetype before its canonical
 * starter weapon surfaces the structured `"no-starting-weapon-for-lineage"`
 * error rather than crashing or silently equipping nothing.
 */
export const LINEAGE_STARTING_WEAPON: Partial<Record<Lineage, WeaponKey>> = {
  warrior: "longsword",
  mage: "staff",
  healer: "censer",
  knight: "spear",
}

/**
 * Looks up the starting weapon key for a Lineage, or `null` when none is
 * defined yet. Callers (currently only the finalize Server Action) surface
 * the null case as a structured error.
 */
export function startingWeaponForLineage(lineage: Lineage): WeaponKey | null {
  return LINEAGE_STARTING_WEAPON[lineage] ?? null
}
