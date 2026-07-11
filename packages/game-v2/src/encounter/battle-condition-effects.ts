import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"

import type { BattleConditionState } from "./vocab"

/**
 * The Attack-Roll modifier a combatant's **Hit/Evasion** Battle Condition confers on
 * its *own* outgoing rolls (rulebook 3.8): **Increased** grants **+3**, **Decreased**
 * a **−7** penalty, Neutral nothing. The asymmetry is intentional — the penalty side
 * is deliberately steeper than the bonus. The rule's *incoming* half (a target's
 * Evasion penalizing rolls made against it) is not modeled: the engine resolves an
 * attacker's own sheet, not per-target rolls.
 */
export const HIT_EVASION_ATTACK_ROLL_MODIFIER: Record<
  BattleConditionState,
  number
> = {
  neutral: 0,
  increased: 3,
  decreased: -7,
}

const HIT_EVASION_SOURCE: Record<BattleConditionState, string> = {
  neutral: "",
  increased: "Hit/Evasion (Increased)",
  decreased: "Hit/Evasion (Decreased)",
}

/**
 * The {@link CombatantEffect}s a combatant's Hit/Evasion Battle Condition contributes
 * to its own Attack Rolls — the boundary helper the encounter loader folds into
 * `resolve`'s effects context, mirroring
 * {@link import("@workspace/game-v2/mechanics/zone-enchantment").zoneEnchantmentEffects}.
 *
 * An unfiltered flat-`amount` `attackRoll` effect (like Perfection / Toccata), so the
 * bonus rides into every one of the combatant's rolls with a labelled `source` for the
 * roll breakdown. Empty for a Neutral axis, so it folds in nothing.
 */
export function hitEvasionAttackRollEffects(
  state: BattleConditionState
): CombatantEffect[] {
  const amount = HIT_EVASION_ATTACK_ROLL_MODIFIER[state]
  if (amount === 0) return []
  return [{ type: "attackRoll", amount, source: HIT_EVASION_SOURCE[state] }]
}
