import type { MechanicDefinition } from "@workspace/game/engine/mechanics/types"
import {
  enchantmentStateSchema,
  type EnchantmentState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Bard — Enchantment. The Bard's Skills may Enchant the Zone they target,
 * leaving residue that affects every combatant standing in it (rulebook
 * `Skills/Mechanics/Enchantment.md`).
 *
 * The Enchantment itself — which Zone, which type, what Level — is battlefield
 * state, so it lives on the encounter session (`session.enchantment`, written
 * by the DM console's `applyEnchantment` event) rather than the character row;
 * its engine-computable effects reach the Bard's (and everyone else's) sheet
 * through the `CombatContext.zoneEffects` channel, resolved per combatant by
 * {@link import("../../encounter/enchantment").zoneEnchantmentEffects}. There
 * is no per-character state to persist, so the mechanic is display-only here:
 * it owns its info card and Combat-tab widget but emits no Effects and exposes
 * no write path.
 */
export const enchantment: MechanicDefinition<EnchantmentState> = {
  kind: "enchantment",
  displayName: "Enchantment",
  tagline:
    "Your Skills Enchant the Zone they target, empowering the combatants standing in it.",
  description: `Your music enchants the battlefield, affecting friends and enemies alike.

***Enchanting.*** Your Skills may list an Enchantment that it creates when cast. The Enchantment is created in the Zone it targets. Only one Zone can be Enchanted at any one time; if you Enchant a second Zone, the first one loses its Enchantment. You always choose whether or not your Skills create an Enchantment unless the Skill specifically says otherwise. All Enchantments end when combat ends.

***Forte.*** If a Zone receives a second Enchantment of the same type, the Enchantment's Forte rises by 1 (*f* → *ff* → *fff*), up to Forte 3. An Enchantment grants the effects of its current Forte and all lower Fortes.`,
  schema: enchantmentStateSchema,
  initialState: () => ({ kind: "enchantment" }),
  resetOn: "encounter",
}
