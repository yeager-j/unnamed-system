import { getItem } from "@workspace/game-v2/catalog/items"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"

/**
 * The starting weapon equipped on a character at finalization, keyed by the
 * Origin Archetype's Lineage (PRD §5.1 step 5 / §5.2 — "Equipment is not chosen
 * in the builder. The starting weapon is the canonical weapon for the
 * character's Origin Lineage; it can be customized from the live sheet after
 * creation."). Re-homed from v1's `foundation/character/lineage.ts` (UNN-556);
 * authored content, so it lives in the catalog and reaches the app through the
 * `startingWeaponForLineage` port.
 *
 * Covers every Lineage that ships an Archetype today. The map is `Partial` so a
 * future Lineage that ships an Archetype before its canonical starter surfaces
 * finalize's structured `"no-starting-weapon-for-lineage"` refusal rather than
 * crashing or silently equipping nothing.
 */
const LINEAGE_STARTING_WEAPON: Partial<Record<Lineage, string>> = {
  warrior: "longsword",
  mage: "staff",
  healer: "censer",
  knight: "spear",
  thief: "dagger",
  warlock: "grimoire",
  bard: "lute",
  berserker: "greataxe",
}

for (const [lineage, key] of Object.entries(LINEAGE_STARTING_WEAPON)) {
  if (getItem(key)?.equip?.slot !== "weapon") {
    throw new Error(
      `Starting weapon for lineage "${lineage}" does not resolve to an equippable weapon: "${key}"`
    )
  }
}

/**
 * Looks up the canonical starting weapon key for a Lineage, or `undefined` when
 * none is authored yet. Implements the {@link import("../../kernel/ports").GameData}
 * port method of the same name.
 */
export function startingWeaponForLineage(lineage: Lineage): string | undefined {
  return LINEAGE_STARTING_WEAPON[lineage]
}
