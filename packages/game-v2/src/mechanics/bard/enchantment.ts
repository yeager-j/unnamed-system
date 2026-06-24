import { z } from "zod/v4"

import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"

/**
 * Bard — Enchantment. The Bard's Skills may Enchant the Zone they target, leaving
 * residue that affects every combatant in it (rulebook `Enchantment.md`).
 *
 * The Enchantment itself — which Zone, type, Forte — is battlefield state living
 * on the encounter (not the character row), so there is no per-character state and
 * the mechanic is display-only here (discriminant only). Its engine-computable
 * effects reach sheets through the **zone channel**
 * ({@link import("../zone-enchantment").zoneEnchantmentEffects} → `resolve`'s
 * effects context), not this mechanic's `effects` pathway.
 */
export const enchantmentStateSchema = z.object({
  kind: z.literal("enchantment"),
})
export type EnchantmentState = z.infer<typeof enchantmentStateSchema>

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
