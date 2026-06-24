import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import {
  type EnchantmentType,
  type ZoneEnchantment,
} from "@workspace/game-v2/mechanics/zone-enchantment.schema"

/**
 * The per-type Enchantment definitions — display name, the per-Forte rule lines,
 * and the structured {@link CombatantEffect}s an Enchanted Zone confers on the
 * combatants standing in it. Engine-owned behavior keyed over the closed
 * {@link EnchantmentType} union, like the mechanics registry — and, like it,
 * deliberately **not** a `GameData` port (rule behavior, not authored catalog).
 *
 * Only engine-computable rules are modelled as effects; the rest of each Forte's
 * text lives in {@link EnchantmentDefinition.forteLines} and stays DM-adjudicated
 * prose, consistent with the app's no-dice philosophy. The Bard mechanic emits no
 * effects of its own — its engine-visible effect flows through this zone channel
 * into `resolve`'s effects context, not the mechanic's `effects()` pathway.
 */
export interface EnchantmentDefinition {
  type: EnchantmentType
  /** Display name shown on zone badges and roll-breakdown sources. */
  name: string
  /**
   * The rule granted at each Forte, indexed `forteLines[forte - 1]`. A Zone grants
   * its current Forte's line and all lower Fortes', so a display surface shows the
   * first `forte` entries.
   */
  forteLines: readonly [string, string, string]
  /**
   * The effects a Zone with this Enchantment at `forte` confers on combatants in
   * it. A Forte grants its own effects and all lower Fortes' — encoded directly
   * (e.g. Toccata's Attack-Roll bonus *equals* the Forte).
   */
  effects(forte: number): CombatantEffect[]
}

export const ENCHANTMENTS_BY_TYPE: Record<
  EnchantmentType,
  EnchantmentDefinition
> = {
  toccata: {
    type: "toccata",
    name: "Toccata",
    forteLines: [
      "Attack Rolls made by combatants in the Zone gain a bonus equal to the Zone's Forte.",
      "Side-Effect Luck checks made by combatants in the Zone win ties instead of losing them.",
      "Natural 19s rolled in the Zone count as natural 20s.",
    ],
    effects: (forte) => [
      { type: "attackRoll", amount: forte, source: "Toccata" },
    ],
  },
  requiem: {
    type: "requiem",
    name: "Requiem",
    forteLines: [
      "All damage is reduced by a flat amount equal to the Zone's Forte.",
      "Combatants are not Downed via a Technical.",
      "Combatants are not Downed via their Weakness.",
    ],
    effects: () => [],
  },
  tarantella: {
    type: "tarantella",
    name: "Tarantella",
    forteLines: [
      "All combatants who start their turn in this Zone gain an additional Reaction.",
      "All combatants who start their turn in this Zone gain an additional Move Action.",
      "All Engaged combatants who start their turn in this Zone gain an additional Standard Action.",
    ],
    effects: () => [],
  },
}

/** The definition for `type` — total over the closed union, so no miss case. */
export function getEnchantment(type: EnchantmentType): EnchantmentDefinition {
  return ENCHANTMENTS_BY_TYPE[type]
}

/**
 * The effects the active Enchantment confers on a combatant standing in `zoneId` —
 * empty when no Enchantment is active or the combatant is in a different Zone. The
 * boundary helper the encounter loader calls per combatant to fill `resolve`'s
 * effects context before resolving its sheet.
 */
export function zoneEnchantmentEffects(
  enchantment: ZoneEnchantment | null,
  zoneId: string
): CombatantEffect[] {
  if (!enchantment || enchantment.zoneId !== zoneId) return []
  return getEnchantment(enchantment.type).effects(enchantment.forte)
}
