import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { isFallen } from "@workspace/game/foundation/character/state"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"

/**
 * Computes the Fallen-combatant set the turn selectors take as their injected
 * `fallenIds` (UNN-305). Fallen is **never stored** — it is vitals-derived, and
 * a combatant's vitals live in different homes by kind, so this resolves each
 * combatant's current HP and collects the ids that are Fallen (`hp <= 0`, via
 * {@link isFallen}):
 *
 * - `pc` — HP comes from the character row, which the session doesn't hold; the
 *   impure caller injects it as `pcCurrentHpById` keyed by `characterId`. A
 *   missing entry is treated as not-Fallen (the caller is expected to supply
 *   every PC combatant's HP).
 * - `enemy` — HP is inline on the session (`statBlock.currentHP`).
 * - `catalog-enemy` — working HP is inline on the ref (`currentHP`), defaulting
 *   to the definition's `maxHP` until first adjusted (UNN-309).
 *
 * This is the **pure half** of the Fallen seam: the impure caller (the DM console
 * / player view, UNN-335 / UNN-322) loads the character rows, builds
 * `pcCurrentHpById`, and passes the resulting set to the selectors on every read
 * — recomputed fresh so a revive (HP back above 0) re-enables the combatant with
 * no event needed.
 */
export function fallenCombatantIds(
  session: CombatSession,
  pcCurrentHpById: Record<string, number>,
  enemyStatblockById: Record<string, Statblock>
): Set<string> {
  const fallen = new Set<string>()

  for (const combatant of session.combatants) {
    const ref = combatant.ref
    if (ref.kind === "pc") {
      const hp = pcCurrentHpById[ref.characterId]
      if (hp !== undefined && isFallen(hp)) fallen.add(combatant.id)
    } else if (ref.kind === "enemy") {
      if (isFallen(ref.statBlock.currentHP)) fallen.add(combatant.id)
    } else if (ref.kind === "catalog-enemy") {
      const currentHP =
        ref.currentHP ?? enemyStatblockById[ref.enemyKey]?.maxHP ?? 0
      if (isFallen(currentHP)) fallen.add(combatant.id)
    }
  }

  return fallen
}
