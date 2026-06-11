import { type CombatantEffect } from "@workspace/game/foundation/combat/effects"
import {
  type EnchantmentType,
  type ZoneEnchantment,
} from "@workspace/game/foundation/combat/enchantment"

/**
 * The per-type Enchantment definitions — display name, the per-Forte rule
 * lines, and the structured {@link CombatantEffect}s an Enchanted Zone confers
 * on the combatants standing in it. Engine-owned behavior keyed over the
 * closed {@link EnchantmentType} union, mirroring the mechanics registry (and
 * like it, deliberately **not** a `GameData` port — this is rule behavior, not
 * authored catalog data).
 *
 * Only the engine-computable rules are modelled as effects; every Forte's
 * full rule text lives in {@link EnchantmentDefinition.forteLines} (the zone
 * badge's tooltip and the granting Skill's card both print it), and the rest
 * — Requiem's damage reduction, Tarantella's extra actions, the tie/nat-19
 * rules — stays DM-adjudicated prose, consistent with the app's no-dice
 * philosophy.
 */
export interface EnchantmentDefinition {
  type: EnchantmentType
  /** Display name shown on zone badges and roll-breakdown sources. */
  name: string
  /**
   * The rule granted at each Forte, indexed `forteLines[forte - 1]`. A Zone
   * grants its current Forte's line and all lower Fortes' (rulebook), so a
   * display surface shows the first `forte` entries.
   */
  forteLines: readonly [string, string, string]
  /**
   * The effects a Zone with this Enchantment at `forte` confers on combatants
   * in it. A Forte grants its own effects and all lower Fortes' (rulebook),
   * which the definitions encode directly (e.g. Toccata's Attack-Roll bonus
   * *equals* the Forte).
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
 * The effects the session's active Enchantment confers on a combatant standing
 * in `zoneId` — empty when no Enchantment is active or the combatant is in a
 * different Zone. The boundary helper encounter loaders call per combatant to
 * fill {@link import("@workspace/game/foundation/character/state").CombatContext}'s
 * `zoneEffects` before deriving its sheet.
 */
export function zoneEnchantmentEffects(
  enchantment: ZoneEnchantment | null,
  zoneId: string
): CombatantEffect[] {
  if (!enchantment || enchantment.zoneId !== zoneId) return []
  return getEnchantment(enchantment.type).effects(enchantment.forte)
}
